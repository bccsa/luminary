import { Controller, Headers, Post, Body } from "@nestjs/common";
import { validateApiVersion } from "../validation/apiVersion";
import { FindService } from "./find.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { FindReqDto } from "../dto/FindReqDto";
import { validate } from "class-validator";
import { instanceToPlain, plainToClass } from "class-transformer";

/** Endpoint supporting MongoDB like queries (Mango Query) */
@Controller("find")
export class FindController {
    constructor(private readonly findService: FindService) {}

    @Post()
    async processPostReq(
        @Body() body: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        const req = plainToClass(FindReqDto, JSON.parse(body));
        await validate(req); // validate request structure
        const versionOk = await validateApiVersion(req.apiVersion); // validate API version
        if (!versionOk) {
            throw new Error("Invalid API version");
        }

        const query = instanceToPlain(req.query) as MongoQueryDto;
        return this.findService.find(query, auth !== undefined ? auth.replace("Bearer ", "") : "");
    }
}
