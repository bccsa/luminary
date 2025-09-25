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
import { createUploadData } from "src/changeRequests/uploadHandler";

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
        console.log("Body: ", body);
        console.log("Files:", files);
        const token = authHeader?.replace("Bearer ", "") ?? "";
        const doc = JSON.parse(body["changeRequestDoc-JSON"]);
        const changeReqId = JSON.parse(body["changeRequestId"]);
        const apiVersion = body["changeRequestApiVersion"];

        if (files?.length) {
            const apiVersion = body["changeRequestApiVersion"];
            await validateApiVersion(apiVersion);

            for (const [index, file] of files.entries()) {
                const fileName = body[`${index}-changeRequestDoc-files-filename`];
                const filePreset = body[`${index}-changeRequestDoc-files-preset`];
                const mediaType = body[`${index}-changeRequestDoc-files-mediaType`];

                const singleUploadData = createUploadData(file, filePreset, {
                    filename: fileName,
                    hlsUrl: body[`${index}-changeRequestDoc-files-hlsUrl`],
                    mediaType: mediaType,
                });

                // Assign uploadData to the correct field in the doc
                if (mediaType) {
                    doc.media.uploadData.push(singleUploadData);
                    doc.media.uploadData = doc.media.uploadData.filter((data) => data != null); // Remove any undefined entries
                } else {
                    doc.imageData.uploadData.push(singleUploadData);
                    doc.imageData.uploadData = doc.imageData.uploadData.filter(
                        (data) => data != null,
                    ); // Remove any undefined entries
                }
            }
        }

        const changeRequest: ChangeReqDto = {
            id: changeReqId,
            doc: doc,
            apiVersion,
        };

        console.log("Change request Media:", changeRequest.doc.media.uploadData);
        // console.log("Change request Image:", changeRequest.doc.imageData.uploadData);

        // If it is just a JSON object (not multipart), validate it correctly
        await validateApiVersion(body.apiVersion);
        return this.changeRequestService.changeRequest(changeRequest, token);
    }
}
