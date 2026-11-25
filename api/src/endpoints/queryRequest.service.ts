import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { FastifyReply, FastifyRequest } from "fastify";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { validateQuery, ALLOWED_IDENTIFIERS } from "../validation/query/validateQuery";
import { classifyQueryCost } from "./queryStats";
import { selectorFingerprint } from "../util/selectorFingerprint";

/** Common query validation, account rate limits and execution-cost reporting. */
@Injectable()
export class QueryRequestService {
    constructor(
        private readonly configService: ConfigService,
        private readonly rateLimiter: QueryRateLimiterService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    async run(
        body: any,
        request: FastifyRequest,
        reply: FastifyReply,
        execute: () => Promise<any>,
        options: { requireValidation?: boolean; indexNames?: ReadonlySet<string> } = {},
    ): Promise<any> {
        // Identity used both for the rate-limit bucket and the expensive-query log line.
        const identityKey = request.authIdentity.rateLimitKey;

        // Pre-execution gate: an identity already in backoff for repeated expensive
        // queries is rejected before doing any work. No-op when the limiter is disabled.
        const gate = this.rateLimiter.check(identityKey);
        if (!gate.allowed) {
            reply.header("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
            throw new HttpException(
                "Too many expensive queries; retry later",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const bypassValidation =
            this.configService.get<boolean>("validation.bypassTemplateValidation") || false;

        const maxLimit = this.configService.get<number>("query.maxLimit") ?? 500;
        const maxLanguages = this.configService.get<number>("query.maxLanguages") ?? 4;

        let validationResult = { valid: true, error: "" };
        if (options.requireValidation || body?.syncPagination !== undefined || !bypassValidation)
            validationResult = validateQuery(body, {
                maxLimit,
                maxLanguages,
                ...(options.indexNames ? { indexNames: options.indexNames } : {}),
            });

        if (!validationResult.valid) {
            throw new BadRequestException(`Invalid query: ${validationResult.error}`);
        }

        // The label is client-supplied, so it is constrained to a known set before
        // reaching the logs; an unrecognised label must not fail the query because it
        // carries no execution meaning.
        const identifier =
            typeof body?.identifier === "string" && ALLOWED_IDENTIFIERS.has(body.identifier)
                ? body.identifier
                : "unknown";
        delete body.identifier;

        const result = await execute();

        // Classify the executed query from CouchDB's execution stats. The cost is only
        // knowable post-hoc, so an expensive query logs once and records a strike
        // (enforcement bites the identity's NEXT request, not this one).
        const thresholds = {
            docsExamined: this.configService.get<number>("query.expensiveDocsExamined") ?? 1000,
            examinedRatio: this.configService.get<number>("query.expensiveExaminedRatio") ?? 10,
        };
        const verdict = classifyQueryCost(
            result?.execution_stats,
            result?.docs?.length ?? 0,
            thresholds,
        );
        if (verdict.expensive) {
            this.logger.warn("Expensive /query", {
                identifier,
                identity: identityKey,
                reason: verdict.reason,
                total_docs_examined: result?.execution_stats?.total_docs_examined,
                total_keys_examined: result?.execution_stats?.total_keys_examined,
                results_returned: result?.docs?.length ?? 0,
                execution_time_ms: result?.execution_stats?.execution_time_ms,
                use_index: body?.use_index,
                // Computed lazily on the post-injection query — reflects what CouchDB
                // actually executed, which is what you want when deciding on an index.
                fingerprint: selectorFingerprint(body),
            });
            this.rateLimiter.recordStrike(identityKey);
        }

        // Strip execution stats from the client response (lean payloads; don't advertise
        // DB internals; future response cache stores lean bodies).
        if (result && result.execution_stats !== undefined) delete result.execution_stats;

        return result;
    }
}
