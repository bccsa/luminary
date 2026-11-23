import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { UserQueryService } from "../userData/userQuery.service";
import { getUserDataIndexNames } from "../userData/userDataDb.service";
import { resolveDataSource } from "../util/dataSource";
import { QueryRequestService } from "./queryRequest.service";
import { QueryService } from "./query.service";

/** Shared-data queries, with compatibility dispatch for existing source-aware clients. */
@Controller("query")
export class QueryController {
    constructor(
        private readonly queryService: QueryService,
        private readonly requests: QueryRequestService,
        private readonly userQueries: UserQueryService,
    ) {}

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(200)
    async processPostReq(
        @Body() body: any,
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<any> {
        const source = resolveDataSource(body?.dataSource);
        // Older clients send named sources to /query. Keep that wire contract during the split.
        if (source)
            return this.requests.run(
                body,
                request,
                reply,
                () => this.userQueries.query(body, request.user),
                { requireValidation: true, indexNames: getUserDataIndexNames() },
            );
        return this.requests.run(body, request, reply, () =>
            this.queryService.query(body as MongoQueryDto, request.user),
        );
    }
}
