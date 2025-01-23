import { Controller, Headers, Get, Post, Body, UseGuards } from "@nestjs/common";
import { DocsReqDto, ChangeReqDto } from "../dto/EndpointsReqDto";
import { DocsService } from "./docs.service";
import { xQuery } from "../validation/x-query";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";

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

    @Post()
    @UseGuards(AuthGuard)
    async upsertDocs(@Body() changeRequest: ChangeReqDto, @Headers("Authorization") auth: string) {
        await validateApiVersion(changeRequest.apiVersion); // validate API version
        return this.docsService.upsertDoc(
            changeRequest,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
