import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Inject,
    Post,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { FtsSearchService, type FtsSearchStats } from "./ftsSearch.service";
import { AuthGuard } from "../auth/auth.guard";
import { FtsSearchReqDto } from "../dto/FtsSearchReqDto";
import { FtsSearchResultDto } from "../dto/FtsSearchResultDto";
import { validateApiVersion } from "../validation/apiVersion";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { FTS_DEFAULT_LIMIT, FTS_MAX_TRIGRAM_DOC_PERCENT } from "../util/ftsScoring";

const FTS_MAX_QUERY_LENGTH = 256;
const FTS_MAX_LIMIT = 50;
const FTS_MAX_WINDOW = 500;

/** Endpoint for server-side full-text search (complements offline/local FTS). */
@Controller("fts")
export class FtsSearchController {
    constructor(
        private readonly ftsSearchService: FtsSearchService,
        private readonly rateLimiter: QueryRateLimiterService,
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
    ) {}

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(200) // enable gzip compression by downstream reverse proxy servers
    async search(
        @Body() body: FtsSearchReqDto,
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<FtsSearchResultDto[]> {
        await validateApiVersion(body.apiVersion);
        validateFtsSearchCaps(body);

        const identityKey = request.user?.userId ?? `anon:${request.ip}`;
        const gate = this.rateLimiter.check(identityKey);
        if (!gate.allowed) {
            reply.header("Retry-After", String(Math.ceil(gate.retryAfterMs / 1000)));
            throw new HttpException(
                "Too many expensive queries; retry later",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const { results, stats } = await this.ftsSearchService.searchWithStats(body, request.user);
        if (isExpensiveFtsSearch(stats)) {
            this.logger.warn("Expensive /fts", {
                identity: identityKey,
                trigrams: stats.trigrams,
                kept_trigrams: stats.keptTrigrams,
                estimated_candidate_rows: stats.estimatedCandidateRows,
                candidate_rows: stats.candidateRows,
                survivors: stats.survivors,
                top_k: stats.topK,
                results_returned: results.length,
            });
            this.rateLimiter.recordStrike(identityKey);
        }

        return results;
    }
}

function validateFtsSearchCaps(body: FtsSearchReqDto): void {
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
