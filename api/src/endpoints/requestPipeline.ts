import {
    BadRequestException,
    HttpException,
    HttpStatus,
    UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Logger } from "winston";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { DbQueryResult } from "../db/db.service";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { FtsSearchReqDto } from "../dto/FtsSearchReqDto";
import { FtsSearchResultDto } from "../dto/FtsSearchResultDto";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { ChangeRequestRateLimiterService } from "../ratelimit/changeRequestRateLimiter.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { FTS_DEFAULT_LIMIT, FTS_MAX_TRIGRAM_DOC_PERCENT } from "../util/ftsScoring";
import { removeDangerousKeys } from "../util/removeDangerousKeys";
import { selectorFingerprint } from "../util/selectorFingerprint";
import { validateApiVersion } from "../validation/apiVersion";
import { ALLOWED_IDENTIFIERS, validateQuery } from "../validation/query/validateQuery";
import { ChangeRequestService } from "./changeRequest.service";
import { FtsSearchService, type FtsSearchStats } from "./ftsSearch.service";
import { QueryService } from "./query.service";
import { classifyQueryCost } from "./queryStats";
import { ReadOptions } from "./readScope";

/**
 * The request steps the REST controllers run around the services (validation, caps, rate
 * limits, expensive-request logging). Shared so the MCP server applies exactly the same rules.
 */

const FTS_MAX_QUERY_LENGTH = 256;
const FTS_MAX_LIMIT = 50;
const FTS_MAX_WINDOW = 500;

/** A 429 that carries how long the caller must wait, so each transport can report it its own way. */
export class RateLimitedException extends HttpException {
    constructor(
        message: string,
        readonly retryAfterSeconds: number,
    ) {
        super(message, HttpStatus.TOO_MANY_REQUESTS);
    }
}

export type QueryPipelineDeps = {
    queryService: QueryService;
    configService: ConfigService;
    rateLimiter: QueryRateLimiterService;
    logger: Logger;
};

/** Validate, rate-limit, run and cost-classify a Mango query (the `/query` pipeline). */
export async function runQuery(
    deps: QueryPipelineDeps,
    body: any,
    user: JwtUserDetails,
    identityKey: string,
    options?: ReadOptions,
): Promise<DbQueryResult> {
    const { queryService, configService, rateLimiter, logger } = deps;

    // Pre-execution gate: an identity already in backoff for repeated expensive
    // queries is rejected before doing any work. No-op when the limiter is disabled.
    const gate = rateLimiter.check(identityKey);
    if (!gate.allowed) {
        throw new RateLimitedException(
            "Too many expensive queries; retry later",
            Math.ceil(gate.retryAfterMs / 1000),
        );
    }

    const bypassValidation =
        configService.get<boolean>("validation.bypassTemplateValidation") || false;

    const maxLimit = configService.get<number>("query.maxLimit") ?? 500;
    const maxLanguages = configService.get<number>("query.maxLanguages") ?? 4;

    let validationResult = { valid: true, error: "" };
    if (!bypassValidation) validationResult = validateQuery(body, { maxLimit, maxLanguages });

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

    const result = options
        ? await queryService.query(body as MongoQueryDto, user, options)
        : await queryService.query(body as MongoQueryDto, user);

    // Classify the executed query from CouchDB's execution stats. The cost is only
    // knowable post-hoc, so an expensive query logs once and records a strike
    // (enforcement bites the identity's NEXT request, not this one).
    const thresholds = {
        docsExamined: configService.get<number>("query.expensiveDocsExamined") ?? 1000,
        examinedRatio: configService.get<number>("query.expensiveExaminedRatio") ?? 10,
    };
    const verdict = classifyQueryCost(
        result?.execution_stats,
        result?.docs?.length ?? 0,
        thresholds,
    );
    if (verdict.expensive) {
        logger.warn("Expensive /query", {
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
        rateLimiter.recordStrike(identityKey);
    }

    // Strip execution stats from the client response (lean payloads; don't advertise
    // DB internals; future response cache stores lean bodies).
    if (result && result.execution_stats !== undefined) delete result.execution_stats;

    return result;
}

export type FtsPipelineDeps = {
    ftsSearchService: FtsSearchService;
    rateLimiter: QueryRateLimiterService;
    logger: Logger;
};

/**
 * Cap, rate-limit, run and cost-classify a full-text search (the `/fts` pipeline). DTO
 * validation is not part of it: on REST the global ValidationPipe does that before the controller.
 */
export async function runFtsSearch(
    deps: FtsPipelineDeps,
    body: FtsSearchReqDto,
    user: JwtUserDetails,
    identityKey: string,
    options?: ReadOptions,
): Promise<FtsSearchResultDto[]> {
    const { ftsSearchService, rateLimiter, logger } = deps;

    await validateApiVersion(body.apiVersion);
    validateFtsSearchCaps(body);

    const gate = rateLimiter.check(identityKey);
    if (!gate.allowed) {
        throw new RateLimitedException(
            "Too many expensive queries; retry later",
            Math.ceil(gate.retryAfterMs / 1000),
        );
    }

    const { results, stats } = options
        ? await ftsSearchService.searchWithStats(body, user, options)
        : await ftsSearchService.searchWithStats(body, user);
    if (isExpensiveFtsSearch(stats)) {
        logger.warn("Expensive /fts", {
            identity: identityKey,
            trigrams: stats.trigrams,
            kept_trigrams: stats.keptTrigrams,
            estimated_candidate_rows: stats.estimatedCandidateRows,
            candidate_rows: stats.candidateRows,
            survivors: stats.survivors,
            top_k: stats.topK,
            results_returned: results.length,
        });
        rateLimiter.recordStrike(identityKey);
    }

    return results;
}

export function validateFtsSearchCaps(body: FtsSearchReqDto): void {
    if ((body.queryString || "").length > FTS_MAX_QUERY_LENGTH)
        throw new BadRequestException(
            `Invalid FTS search: queryString must be ${FTS_MAX_QUERY_LENGTH} characters or less`,
        );

    const limit = body.limit && body.limit > 0 ? body.limit : FTS_DEFAULT_LIMIT;
    const offset = body.offset && body.offset > 0 ? body.offset : 0;

    if (limit > FTS_MAX_LIMIT)
        throw new BadRequestException(`Invalid FTS search: limit must be ${FTS_MAX_LIMIT} or less`);
    if (offset + limit > FTS_MAX_WINDOW)
        throw new BadRequestException(
            `Invalid FTS search: offset + limit must be ${FTS_MAX_WINDOW} or less`,
        );
    if (
        body.maxTrigramDocPercent != null &&
        body.maxTrigramDocPercent > FTS_MAX_TRIGRAM_DOC_PERCENT
    )
        throw new BadRequestException(
            `Invalid FTS search: maxTrigramDocPercent must be ${FTS_MAX_TRIGRAM_DOC_PERCENT} or less`,
        );
}

function isExpensiveFtsSearch(stats: FtsSearchStats): boolean {
    return (
        stats.estimatedCandidateRows >= stats.candidateRowBudget ||
        stats.candidateRows >= stats.candidateRowBudget
    );
}

export type ChangeRequestPipelineDeps = {
    changeRequestService: ChangeRequestService;
    rateLimiter: ChangeRequestRateLimiterService;
};

/**
 * Admit a change request before any parsing: reject anonymous callers and count the request
 * against the identity's rate limit.
 */
export function admitChangeRequest(
    deps: ChangeRequestPipelineDeps,
    user: JwtUserDetails,
    identityKey: string,
): void {
    // Reject before parsing: multipart handling buffers every uploaded file in memory, which an anonymous caller must not be able to trigger
    if (user?.anonymous) {
        throw new UnauthorizedException("Authentication required");
    }

    // Counted before parsing so a flood of oversized or malformed requests is limited too
    const gate = deps.rateLimiter.check(identityKey);
    if (!gate.allowed) {
        throw new RateLimitedException(
            "Too many change requests; retry later",
            Math.ceil(gate.retryAfterMs / 1000),
        );
    }
    deps.rateLimiter.recordRequest(identityKey);
}

/** Validate and process an admitted JSON change request. */
export async function submitChangeRequest(
    deps: ChangeRequestPipelineDeps,
    body: ChangeReqDto,
    user: JwtUserDetails,
): Promise<ChangeReqAckDto> {
    await validateApiVersion(body.apiVersion);
    // Clean prototype pollution from the body before processing
    const cleanedBody = removeDangerousKeys(body);
    return deps.changeRequestService.changeRequest(cleanedBody, user);
}

/** Run a pipeline step for a REST controller, setting `Retry-After` when the caller is rate-limited. */
export async function withRetryAfter<T>(
    reply: { header(name: string, value: string): unknown },
    run: () => T | Promise<T>,
): Promise<T> {
    try {
        return await run();
    } catch (err) {
        if (err instanceof RateLimitedException) {
            reply.header("Retry-After", String(err.retryAfterSeconds));
        }
        throw err;
    }
}
