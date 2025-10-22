import {
    Controller,
    Headers,
    Post,
    Body,
    UseGuards,
    UploadedFiles,
    UseInterceptors,
} from "@nestjs/common";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ChangeRequestService } from "./changeRequest.service";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { createUploadData } from "../changeRequests/uploadHandler";

@Controller("changerequest")
export class ChangeRequestController {
    constructor(private readonly changeRequestService: ChangeRequestService) {}

    @Post()
    @UseGuards(AuthGuard)
    @UseInterceptors(
        AnyFilesInterceptor({
            limits: {
                fileSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE, 10) || 1e7,
            },
        }),
    )
    async handleChangeRequest(
        @UploadedFiles() files,
        @Body() body,
        @Headers("Authorization") authHeader: string,
    ) {
        const token = authHeader?.replace("Bearer ", "") ?? "";
        const doc = JSON.parse(body["changeRequestDoc-JSON"]);
        const changeReqId = JSON.parse(body["changeRequestId"]);
        const apiVersion = body["changeRequestApiVersion"];

        if (files?.length) {
            const apiVersion = body["changeRequestApiVersion"];
            await validateApiVersion(apiVersion);

            for (const [index, file] of files.entries()) {
                const filePreset = body[`${index}-changeRequestDoc-files-preset`];
                const mediaType = body[`${index}-changeRequestDoc-files-mediaType`];
                const languageId = body[`${index}-changeRequestDoc-files-languageId`];

                const singleUploadData = createUploadData(file, filePreset, {
                    hlsUrl: body[`${index}-changeRequestDoc-files-hlsUrl`],
                    mediaType: mediaType,
                    languageId: languageId,
                });

                // Assign uploadData to the correct field in the doc
                if (mediaType) {
                    doc.media.uploadData.push(singleUploadData);
                } else {
                    doc.imageData.uploadData.push(singleUploadData);
                }
            }
        }

        const changeRequest: ChangeReqDto = {
            id: changeReqId,
            doc: doc,
            apiVersion,
        };

        // If it is just a JSON object (not multipart), validate it correctly
        await validateApiVersion(body.apiVersion);
        return this.changeRequestService.changeRequest(changeRequest, token);
    }
}
