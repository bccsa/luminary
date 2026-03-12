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
import validateMongoQuery from "../db/MongoQueryTemplates/validateMongoQuery";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { AuthGuard } from "../auth/auth.guard";
import { ResolvedIdentity } from "../auth/auth-identity.service";
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
    @HttpCode(200) // override the default 201 created status code to enable gzip compression by downstream reverse proxy servers
    @UseGuards(AuthGuard)
    async processPostReq(@Body() body: any, @Req() request: FastifyRequest): Promise<any> {
        const bypassValidation =
            this.configService.get<boolean>("validation.bypassTemplateValidation") || false;

        let validationResult = { valid: true, error: "" };
        if (!bypassValidation) validationResult = validateMongoQuery(body as MongoQueryDto);

        if (!validationResult.valid) {
            throw new BadRequestException(`Invalid query: ${validationResult.error}`);
        }

        delete body.identifier;
        const identity = (request as any).user as ResolvedIdentity;
        return this.queryService.query(body as MongoQueryDto, identity);
    }
}
