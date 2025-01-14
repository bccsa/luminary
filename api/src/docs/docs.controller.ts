import { Controller, Headers, Get, HttpException, HttpStatus } from "@nestjs/common";
import { DocsReqDto } from "../dto/DocsReqDto";
import { DocsService } from "./docs.service";
import { validateSync } from "class-validator";

@Controller("docs")
export class DocsController {
    constructor(private readonly docsService: DocsService) {}

    @Get()
    async getDocs(
        @Headers("X-Query") doc: string,
        @Headers("Authorization") auth: string,
    ): Promise<any> {
        if (!doc) {
            throw new HttpException(`X-Query header is required`, HttpStatus.BAD_REQUEST);
        }
        const docObj = JSON.parse(doc);
        const docsReqDto = Object.assign(new DocsReqDto(), docObj);
        const errors = validateSync(docsReqDto);
        if (errors.length > 0) {
            throw new HttpException(`Validation failed: ${errors}`, HttpStatus.BAD_REQUEST);
        }
        return this.docsService.processReq(
            JSON.parse(doc),
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
