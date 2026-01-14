import {
    Controller,
    Headers,
    Post,
    Body,
    BadRequestException,
    Inject,
    HttpCode,
} from "@nestjs/common";
// import { validateApiVersion } from "../validation/apiVersion";
import { QueryService } from "./query.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
// import { FindReqDto } from "../dto/FindReqDto";
// import { plainToClass } from "class-transformer";
import validateMongoQuery from "../db/MongoQueryTemplates/validateMongoQuery";
import { ConfigService } from "@nestjs/config";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";

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
    async processPostReq(@Body() body: any, @Headers("Authorization") auth: string): Promise<any> {
        // TODO: add api version validation

        const bypassValidation =
            this.configService.get<boolean>("validation.bypassTemplateValidation") || false;

        let validationResult = { valid: true, error: "" };
        if (!bypassValidation) validationResult = validateMongoQuery(body as MongoQueryDto);

        if (!validationResult.valid) {
            throw new BadRequestException(`Invalid query: ${validationResult.error}`);
        }

        delete body.identifier;
        return this.queryService.query(
            body as MongoQueryDto,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
