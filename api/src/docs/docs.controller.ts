import { Body, Controller, Post, Headers } from "@nestjs/common";
import { PostDocsDto } from "../dto/RestDocsDto";
import { DocsService } from "./docs.service";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Post()
    async getDocs(@Body() doc: PostDocsDto, @Headers("Authorization") auth: string): Promise<any> {
        return this.docsService.processReq(doc, auth.replace("Bearer ", ""));
    }
}
