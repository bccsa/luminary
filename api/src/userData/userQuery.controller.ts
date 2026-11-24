import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard";
import { QueryRequestService } from "../endpoints/queryRequest.service";
import { resolveDataSource } from "../util/dataSource";
import { USER_ACTIVITY_SOURCE } from "./activityIdentity";
import { getUserDataIndexNames } from "./userDataDb.service";
import { UserQueryService } from "./userQuery.service";
import { requireUserDataOwner } from "../auth/requestContext";

/** Dedicated owner-scoped query endpoint; omission selects user activity. */
@Controller("user/query")
export class UserQueryController {
    constructor(
        private readonly queries: UserQueryService,
        private readonly requests: QueryRequestService,
    ) {}

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(200)
    async processPostReq(
        @Body() body: any,
        @Req() request: FastifyRequest,
        @Res({ passthrough: true }) reply: FastifyReply,
    ): Promise<any> {
        const dataSource = resolveDataSource(body?.dataSource) ?? USER_ACTIVITY_SOURCE;
        const query = { ...body, dataSource };
        return this.requests.run(
            query,
            request,
            reply,
            () => this.queries.query(query, requireUserDataOwner(request.authIdentity)),
            { requireValidation: true, indexNames: getUserDataIndexNames() },
        );
    }
}
