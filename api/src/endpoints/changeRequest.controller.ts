import {
    Controller,
    Headers,
    Post,
    Body,
    UseGuards,
    UploadedFiles,
    UseInterceptors,
    BadRequestException,
} from "@nestjs/common";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ChangeRequestService } from "./changeRequest.service";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { DocType } from "src/enums";
import { fileTypeFromBuffer } from "file-type";
// Files (atleast for now) must be images, we use
// octec-stream inside form data to send any binary data, this allows
// us to send more file types in the future
// but it can also allow for malicious code to be included in
// other file types. Ensuring the file is the following,
// we keep how files are handled secure
// NOTE: This works because binary contains magic numbers
// that indicates what type of file the binary represents
// https://en.wikipedia.org/wiki/Magic_number_(programming)
@Controller("changerequest")
export class ChangeRequestController {
    constructor(private readonly changeRequestService: ChangeRequestService) {}

    @Post()
    @UseGuards(AuthGuard)
    @UseInterceptors(AnyFilesInterceptor())
    async handleChangeRequest(
        @UploadedFiles() files,
        @Body() body,
        @Headers("Authorization") authHeader: string,
    ) {
        const token = authHeader?.replace("Bearer ", "") ?? "";

        if (files?.length || typeof body["changeRequestDoc-JSON"] === "string") {
            const apiVersion = body["changeRequestApiVersion"];
            await validateApiVersion(apiVersion);

            let parsedDoc;
            try {
                parsedDoc = JSON.parse(body["changeRequestDoc-JSON"]);
            } catch (e) {
                throw new BadRequestException("Malformed JSON in 'changeRequestDoc-JSON'");
            }

            if ((parsedDoc && parsedDoc.type == DocType.Post) || parsedDoc.type == DocType.Tag) {
                if (files.length > 0) {
                    const uploadData = [];
                    // We are using a for..of so each file validation is awaited correctly
                    // as forEach does not await properly so validation could be skipped
                    for (const [index, file] of files.entries()) {
                        const fileType = await fileTypeFromBuffer(file.buffer);
                        if (!fileType || !fileType.mime.startsWith("image/")) {
                            throw new BadRequestException("Invalid file type was found");
                        }
                        const fileName = body[`${index}-changeRequestDoc-files-filename`];
                        const filePreset = body[`${index}-changeRequestDoc-files-preset`];

                        uploadData.push({
                            fileData: file.buffer,
                            filename: fileName,
                            preset: filePreset,
                        });
                    }
                    parsedDoc.imageData.uploadData = uploadData;
                }
            }

            let changeReqId;
            try {
                changeReqId = JSON.parse(body["changeRequestId"]);
            } catch (err) {
                throw new BadRequestException("Malformed JSON in 'changeRequestId");
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
