import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Post,
    Req,
    Res,
    UseGuards,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard } from "../auth/auth.guard";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { QueryRequestService } from "./queryRequest.service";
import { QueryService } from "./query.service";

/** Queries the shared dataset; owner-scoped queries use /user/query. */
@Controller("query")
export class QueryController {
    constructor(
        private readonly queryService: QueryService,
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
        if (body?.dataSource !== undefined)
            throw new BadRequestException("Named sources must use their dedicated query endpoint");
        return this.requests.run(body, request, reply, () =>
            this.queryService.query(body as MongoQueryDto, request.user),
        );
    }
}
