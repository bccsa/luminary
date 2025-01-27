import { Controller, Headers, Get } from "@nestjs/common";
import { SearchReqDto } from "../dto/SearchReqDto";
import { SearchService } from "./search.service";
import { xQuery } from "../validation/x-query";
import { validateApiVersion } from "../validation/apiVersion";

@Controller("search")
export class SearchController {
    constructor(private readonly searchService: SearchService) {}

    @Get()
    async getDocs(
        @Headers("X-Query") query: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        const queryObj = xQuery(query, SearchReqDto);
        await validateApiVersion(queryObj.apiVersion); // validate API version

        return this.searchService.processReq(
            queryObj,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
