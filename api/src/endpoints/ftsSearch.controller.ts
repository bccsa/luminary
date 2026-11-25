import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { FtsSearchService } from "./ftsSearch.service";
import { AuthGuard } from "../auth/auth.guard";
import { FtsSearchReqDto } from "../dto/FtsSearchReqDto";
import { FtsSearchResultDto } from "../dto/FtsSearchResultDto";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { runFtsSearch, withRetryAfter } from "./requestPipeline";

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
        const identityKey = request.user?.userId ?? `anon:${request.ip}`;

        return withRetryAfter(reply, () =>
            runFtsSearch(
                {
                    ftsSearchService: this.ftsSearchService,
                    rateLimiter: this.rateLimiter,
                    logger: this.logger,
                },
                body,
                request.user,
                identityKey,
            ),
        );
    }
}
