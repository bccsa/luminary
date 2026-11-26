import { Controller, Post, Body, Inject, HttpCode, UseGuards, Req, Res } from "@nestjs/common";
import { QueryService } from "./query.service";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { runQuery, withRetryAfter } from "./requestPipeline";

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

        return withRetryAfter(reply, () =>
            runQuery(
                {
                    queryService: this.queryService,
                    configService: this.configService,
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
