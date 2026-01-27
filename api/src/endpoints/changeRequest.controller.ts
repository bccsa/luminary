import { Controller, Headers, Post, Req, UseGuards, UsePipes } from "@nestjs/common";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ChangeRequestService } from "./changeRequest.service";
import { FastifyRequest } from "fastify";
import { removeDangerousKeys } from "../util/removeDangerousKeys";
import { patchFileData } from "../util/patchFileData";

@Controller("changerequest")
export class ChangeRequestController {
    constructor(private readonly changeRequestService: ChangeRequestService) {}

    @Post()
    @UseGuards(AuthGuard)
    @UsePipes()
    async handleChangeRequest(
        @Req() request: FastifyRequest,
        @Headers("Authorization") authHeader: string,
    ) {
        const token = authHeader?.replace("Bearer ", "") ?? "";

        let body: Record<string, any> = {};
        const files: Array<{ buffer: Buffer; fieldname: string }> = [];

        // Check if this is a multipart request
        if (request.isMultipart()) {
            const parts = request.parts();

            for await (const part of parts) {
                if (part.type === "file") {
                    const buffer = await part.toBuffer();
                    files.push({ buffer, fieldname: part.fieldname });
                } else {
                    body[part.fieldname] = part.value as string;
                }
            }
        } else {
            // Standard JSON request
            body = (request.body as any) || {};
        }

        // Check if this is a multipart form data request (with potential binary data)
        const jsonKey = Object.keys(body).find((key) => key.endsWith("__json"));
        if (jsonKey) {
            // Parse the main JSON payload
            // Handle case where LFormData may have appended JSON multiple times (for merging)
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
            // The parsed JSON IS already the ChangeReqDto structure
            const changeRequest: ChangeReqDto = parsedData;

            // Ensure apiVersion is set
            if (!changeRequest.apiVersion) {
                changeRequest.apiVersion = apiVersion;
            }

            const result = await this.changeRequestService.changeRequest(changeRequest, token);

            return result;
        }

        // If it is just a JSON object (not multipart), validate it correctly
        await validateApiVersion(body.apiVersion);
        // Clean prototype pollution from the body before processing
        const cleanedBody = removeDangerousKeys(body);
        const result = await this.changeRequestService.changeRequest(cleanedBody, token);

        return result;
    }
}
