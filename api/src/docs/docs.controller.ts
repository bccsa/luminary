import { Controller, Headers, Get } from "@nestjs/common";
import { DocsReqDto } from "../dto/DocsReqDto";
import { DocsService } from "./docs.service";
import { Validate } from "class-validator";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Get()
    async getDocs(
        @Headers("X-Query") doc: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        Validate(DocsReqDto);
        return this.docsService.processReq(
            JSON.parse(doc),
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
