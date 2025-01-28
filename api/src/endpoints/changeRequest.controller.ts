import { Controller, Headers, Post, Body, UseGuards } from "@nestjs/common";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ChangeRequestService } from "./changeRequest.service";

@Controller("changerequest")
export class ChangeRequestController {
    constructor(private readonly changeRequestService: ChangeRequestService) {}

    @Post()
    @UseGuards(AuthGuard)
    async upsertDocs(@Body() changeRequest: ChangeReqDto, @Headers("Authorization") auth: string) {
        await validateApiVersion(changeRequest.apiVersion); // validate API version
        return this.changeRequestService.changeRequest(
            changeRequest,
            auth !== undefined ? auth.replace("Bearer ", "") : "",
        );
    }
}
