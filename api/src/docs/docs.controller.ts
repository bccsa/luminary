import { Body, Controller, Post, UseGuards, Headers } from "@nestjs/common";
import { PostDocsDto } from "../dto/RestDocsDto";
import { AuthGuard } from "../auth/auth.guard";
import { DocsService } from "./docs.service";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Post()
    @UseGuards(AuthGuard)
    async getDocs(@Body() doc: PostDocsDto, @Headers("Authorization") auth: string): Promise<any> {
        return this.docsService.processReq(doc, auth.replace("Bearer ", ""));
    }
}
