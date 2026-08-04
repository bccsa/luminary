import {
    Controller,
    Post,
    Body,
    BadRequestException,
    HttpException,
    HttpStatus,
    Inject,
    HttpCode,
    UseGuards,
    Req,
    Res,
} from "@nestjs/common";
import { QueryService } from "./query.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { validateQuery } from "../validation/query/validateQuery";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";
import { classifyQueryCost } from "./queryStats";
import { selectorFingerprint } from "../util/selectorFingerprint";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { expandMangoSelector } from "../util/expandMangoQuery";

/** Endpoint supporting MongoDB like queries (Mango Query) */
@Controller("query")
export class QueryController {
    constructor(
        private readonly queryService: QueryService,
        private readonly configService: ConfigService,
        private readonly rateLimiter: QueryRateLimiterService,
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
    ) {}

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(200) // override the default 201 created status code to enable gzip compression by downstream reverse proxy servers
    async processPostReq(
        @Body() body: any,
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<any> {
        // TODO: add api version validation

        // Identity used both for the rate-limit bucket and the expensive-query log line.
        const identityKey = request.user?.userId ?? `anon:${request.ip}`;

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

        // A sync cursor collapsed to the epoch cannot match a valid updatedTimeUtc value, but
        // CouchDB may still walk the selected index before returning no documents. Keep this
        // invariant outside the optional validation bypass so the impossible query never reaches
        // QueryService/CouchDB.
        const updatedTimeUtc = body?.selector?.updatedTimeUtc;
        if (updatedTimeUtc?.$lte === 0 && updatedTimeUtc?.$gte === 0) {
            throw new BadRequestException(
                "Invalid query: updatedTimeUtc $lte and $gte must not both be 0",
            );
        }

        // Reject an oversized parentId fan-out, and strike large-but-allowed ones early —
        // the fan-out size is known before the query runs, so abuse doesn't need to wait
        // for post-hoc execution_stats.
        const maxFanoutParents = this.configService.get<number>("query.maxFanoutParents") ?? 200;
        const fanoutStrikeThreshold =
            this.configService.get<number>("query.fanoutStrikeThreshold") ?? 25;
        const fanoutSize = countParentIdFanout(body?.selector);
        if (fanoutSize > maxFanoutParents) {
            throw new BadRequestException(
                `Invalid query: 'parentId.$in' exceeds the maximum fan-out size (${maxFanoutParents})`,
            );
        }
        if (fanoutSize > fanoutStrikeThreshold) {
            this.rateLimiter.recordStrike(identityKey);
        }

        const bypassValidation =
            this.configService.get<boolean>("validation.bypassTemplateValidation") || false;

        const maxLimit = this.configService.get<number>("query.maxLimit") ?? 500;
        const maxLanguages = this.configService.get<number>("query.maxLanguages") ?? 4;

        let validationResult = { valid: true, error: "" };
        if (!bypassValidation) validationResult = validateQuery(body, { maxLimit, maxLanguages });

        if (!validationResult.valid) {
            throw new BadRequestException(`Invalid query: ${validationResult.error}`);
        }

        // `identifier` is an observability label only; strip it before the query runs.
        const identifier = typeof body?.identifier === "string" ? body.identifier : "unknown";
        delete body.identifier;

        const result = await this.queryService.query(body as MongoQueryDto, request.user);

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

/**
 * Size of the selector's `parentId.$in` array, or 0 if absent. Selector is expanded
 * first since `parentId` may sit at the top level or nested under `$and`.
 */
function countParentIdFanout(selector: any): number {
    if (!selector || typeof selector !== "object") return 0;
    const conditions = expandMangoSelector(selector).$and ?? [];
    for (const condition of conditions) {
        const value = (condition as any)?.parentId;
        if (value && typeof value === "object" && Array.isArray(value.$in)) {
            return value.$in.length;
        }
    }
    return 0;
}
