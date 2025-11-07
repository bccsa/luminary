import { Controller, Headers, Post, Body, BadRequestException } from "@nestjs/common";
// import { validateApiVersion } from "../validation/apiVersion";
import { QueryService } from "./query.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
// import { FindReqDto } from "../dto/FindReqDto";
// import { plainToClass } from "class-transformer";
import validateMongoQuery from "../db/MongoQueryTemplates/validateMongoQuery";

/** Endpoint supporting MongoDB like queries (Mango Query) */
@Controller("query")
export class QueryController {
    constructor(private readonly queryService: QueryService) {}

    @Post()
    async processPostReq(@Body() body: any, @Headers("Authorization") auth: string): Promise<any> {
        // TODO: add api version validation

        const validationResult = validateMongoQuery(body as MongoQueryDto);
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
