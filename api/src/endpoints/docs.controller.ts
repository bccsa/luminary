import { Controller, Headers, Get } from "@nestjs/common";
import { DocsReqDto } from "../dto/DocsReqDto";
import { DocsService } from "./docs.service";
import { xQuery } from "../validation/x-query";
import { validateApiVersion } from "../validation/apiVersion";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Get()
    async getDocs(
        @Headers("X-Query") query: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        const queryObj = xQuery(query, DocsReqDto);
        await validateApiVersion(queryObj.apiVersion); // validate API version

        return this.docsService.processReq(
            queryObj,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
