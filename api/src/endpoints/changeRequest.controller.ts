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

                // Create a map of fileKey -> file data
                // LFormData sends files as: ${baseKey}__file__${index} and metadata as ${baseKey}__file__${index}__meta
                const fileMap = new Map<string, { data: Buffer; metadata: Record<string, any> }>();

                files.forEach((file) => {
                    // Match files by their fieldname (e.g., "changeRequest__file__0")
                    const fileKey = file.fieldname;
                    const metaKey = `${fileKey}__meta`;

                    // Parse metadata if available
                    let metadata: Record<string, any> = {};
                    if (body[metaKey]) {
                        try {
                            const rawMetadata = JSON.parse(body[metaKey]);
                            // Clean prototype pollution from metadata
                            metadata = removeDangerousKeys(rawMetadata);
                        } catch (e) {
                            // If metadata parsing fails, use empty object
                            metadata = {};
                        }
                    }

                    fileMap.set(fileKey, { data: file.buffer, metadata });
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
