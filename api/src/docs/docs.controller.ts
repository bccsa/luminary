import { Body, Controller, Post, Headers } from "@nestjs/common";
import { DocsReqDto } from "../dto/DocsReqDto";
import { DocsService } from "./docs.service";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Post()
    async getDocs(@Body() doc: DocsReqDto, @Headers("Authorization") auth: string): Promise<any> {
        return this.docsService.processReq(
            doc,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
