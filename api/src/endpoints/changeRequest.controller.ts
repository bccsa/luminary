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
import { removeDangerousKeys } from "../util/removeDangerousKeys";
import { patchFileData } from "../util/patchFileData";

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

        // Check if this is a multipart form data request (with potential binary data)
        // LFormData uses __json suffix instead of -JSON
        const jsonKey = Object.keys(body).find((key) => key.endsWith("__json"));

        if (files?.length || jsonKey) {
            const apiVersion = body["apiVersion"];
            await validateApiVersion(apiVersion);

            // Parse the main JSON payload
            let parsedData = JSON.parse(body[jsonKey]);

            // Clean prototype pollution keys before processing
            parsedData = removeDangerousKeys(parsedData);

            // Patch binary data (file buffers) back into placeholders
            if (files.length > 0) {
                const baseKey = jsonKey.replace("__json", "");

                // Create a map of fileKey -> file buffer
                // LFormData sends files as: ${baseKey}__file__${id}
                // The ${id} matches the ID in the BINARY_REF-{id} string in the JSON
                const fileMap = new Map<string, Buffer>();

                files.forEach((file) => {
                    // Match files by their fieldname (e.g., "changeRequest__file__{uuid}")
                    // The UUID in the fieldname matches the ID in "BINARY_REF-{uuid}" in the JSON
                    const fileKey = file.fieldname;
                    fileMap.set(fileKey, file.buffer);
                });

                patchFileData(parsedData, fileMap, baseKey);
            }

            // Extract the ChangeReqDto from the parsed data
            const changeRequest: ChangeReqDto = {
                id: parsedData.id,
                doc: parsedData.doc,
                apiVersion,
            };

            return this.changeRequestService.changeRequest(changeRequest, token);
        }

        // If it is just a JSON object (not multipart), validate it correctly
        await validateApiVersion(body.apiVersion);
        // Clean prototype pollution from the body before processing
        const cleanedBody = removeDangerousKeys(body);
        return this.changeRequestService.changeRequest(cleanedBody, token);
    }
}
