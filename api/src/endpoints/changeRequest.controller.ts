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

        if (files?.length || typeof body["changeRequestDoc-JSON"] === "string") {
            const apiVersion = body["changeRequestApiVersion"];
            await validateApiVersion(apiVersion);

            const changeReqId = JSON.parse(body["changeRequestId"]);
            const parsedDoc = JSON.parse(body["changeRequestDoc-JSON"]);

            //Only parent documents (Posts and Tags) can have files uploaded,
            //Child documents only have a reference to the parent document's fileCollection field
            //without this check it could lead to unexpected behavior or critical errors
            if (files.length > 0) {
                const uploadData = [];

                files.forEach((file, index) => {
                    const fileName = body[`${index}-changeRequestDoc-files-filename`];
                    const filePreset = body[`${index}-changeRequestDoc-files-preset`];
                    const fileBucketId = body[`${index}-changeRequestDoc-files-bucketId`];

                    uploadData.push({
                        fileData: file.buffer,
                        filename: fileName,
                        preset: filePreset,
                        bucketId: fileBucketId,
                    });
                });

                parsedDoc.imageData.uploadData = uploadData;
            }

            const changeRequest: ChangeReqDto = {
                id: changeReqId,
                doc: parsedDoc,
                apiVersion,
            };

            return this.changeRequestService.changeRequest(changeRequest, token);
        }

        // If it is just a JSON object (not multipart), validate it correctly
        await validateApiVersion(body.apiVersion);
        return this.changeRequestService.changeRequest(body, token);
    }
}
