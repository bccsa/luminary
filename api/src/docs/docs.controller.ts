import { Body, Controller, Post, Headers, Get } from "@nestjs/common";
import { DocsReqDto } from "../dto/DocsReqDto";
import { DocsService } from "./docs.service";
import { Validate } from "class-validator";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Post()
    async postDocs(@Body() doc: DocsReqDto, @Headers("Authorization") auth: string): Promise<any> {
        return this.docsService.processReq(
            doc,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }

    @Get()
    async getDocs(
        @Headers("Custom-Body") doc: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        Validate(DocsReqDto);
        return this.docsService.processReq(
            JSON.parse(doc),
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
