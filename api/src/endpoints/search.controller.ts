import { Controller, Headers, Get, UseGuards, Req } from "@nestjs/common";
import { SearchReqDto } from "../dto/SearchReqDto";
import { SearchService } from "./search.service";
import { xQuery } from "../validation/x-query";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ResolvedIdentity } from "../auth/auth-identity.service";
import { FastifyRequest } from "fastify";

@Controller("search")
export class SearchController {
    constructor(private readonly searchService: SearchService) {}

    @Get()
    @UseGuards(AuthGuard)
    async getDocs(
        @Headers("X-Query") query: string,
        @Req() request: FastifyRequest,
    ): Promise<any> {
        const queryObj = xQuery(query, SearchReqDto);
        await validateApiVersion(queryObj.apiVersion); // validate API version

        const identity = (request as any).user as ResolvedIdentity;
        return this.searchService.processReq(queryObj, identity);
    }
}
