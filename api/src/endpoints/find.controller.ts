import { Controller, Headers, Post, Body } from "@nestjs/common";
// import { validateApiVersion } from "../validation/apiVersion";
import { FindService } from "./find.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
// import { FindReqDto } from "../dto/FindReqDto";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";

/** Endpoint supporting MongoDB like queries (Mango Query) */
@Controller("find")
export class FindController {
    constructor(private readonly findService: FindService) {}

    @Post()
    async processPostReq(@Body() body: any, @Headers("Authorization") auth: string): Promise<any> {
        // TODO: add api version validation

        const query = plainToClass(MongoQueryDto, body);
        const errors = await validate(query); // validate request structure
        if (errors.length > 0) {
            throw new Error("Invalid request structure");
        }
        return this.findService.find(query, auth !== undefined ? auth.replace("Bearer ", "") : "");
    }
}
