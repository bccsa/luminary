import {
    Controller,
    Post,
    Body,
    BadRequestException,
    Inject,
    HttpCode,
    UseGuards,
    Req,
} from "@nestjs/common";
import { QueryService } from "./query.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { validateQuery } from "../validation/query/validateQuery";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { AuthGuard } from "../auth/auth.guard";
import { FastifyRequest } from "fastify";

/** Endpoint supporting MongoDB like queries (Mango Query) */
@Controller("query")
export class QueryController {
    constructor(
        private readonly queryService: QueryService,
        private readonly configService: ConfigService,
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
    ) {}

    @Post()
    @UseGuards(AuthGuard)
    @HttpCode(200) // override the default 201 created status code to enable gzip compression by downstream reverse proxy servers
    async processPostReq(@Body() body: any, @Req() request: FastifyRequest): Promise<any> {
        // TODO: add api version validation

        const bypassValidation =
            this.configService.get<boolean>("validation.bypassTemplateValidation") || false;

        const maxLimit = this.configService.get<number>("query.maxLimit") ?? 500;

        let validationResult = { valid: true, error: "" };
        if (!bypassValidation) validationResult = validateQuery(body, { maxLimit });

        if (!validationResult.valid) {
            throw new BadRequestException(`Invalid query: ${validationResult.error}`);
        }

        // `identifier` is an observability label only; strip it before the query runs.
        delete body.identifier;

        return this.queryService.query(body as MongoQueryDto, request.user);
    }
}
