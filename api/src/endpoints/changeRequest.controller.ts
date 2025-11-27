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
            // Parse the main JSON payload
            // Handle case where LFormData may have appended JSON multiple times (for merging)
            // NestJS may return an array for duplicate keys - use the last value (the merged JSON)
            const jsonValue = body[jsonKey];
            const jsonString = Array.isArray(jsonValue)
                ? jsonValue[jsonValue.length - 1]
                : String(jsonValue);

            let parsedData: any;
            try {
                parsedData = JSON.parse(jsonString);
            } catch (error) {
                // If parsing fails, it might be concatenated JSON strings
                // Try to extract the last complete JSON object
                const lastBrace = jsonString.lastIndexOf("}");
                if (lastBrace > 0) {
                    // Find the matching opening brace by counting braces
                    let depth = 1;
                    let start = lastBrace - 1;
                    while (depth > 0 && start >= 0) {
                        if (jsonString[start] === "}") depth++;
                        if (jsonString[start] === "{") depth--;
                        start--;
                    }
                    const lastJson = jsonString.substring(start + 1, lastBrace + 1);
                    parsedData = JSON.parse(lastJson);
                } else {
                    throw error;
                }
            }

            // Clean prototype pollution keys before processing
            parsedData = removeDangerousKeys(parsedData);

            // Get apiVersion from parsedData (LFormData merges separately appended fields)
            const apiVersion = parsedData.apiVersion || body["apiVersion"];
            await validateApiVersion(apiVersion);

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
            // Types are preserved by LFormData, so id should already be a number
            const changeRequest: ChangeReqDto = {
                id: parsedData.id,
                doc: parsedData.doc,
                apiVersion: parsedData.apiVersion || apiVersion,
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
