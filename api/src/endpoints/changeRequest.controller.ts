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
        // Debug object to track request processing
        const debug: any = {
            requestHeaders: {
                contentType: request.headers["content-type"],
                authorization: authHeader ? "present" : "missing",
            },
            isMultipart: false,
            bodyKeys: [],
            bodyContent: {} as any,
            hasJsonKey: false,
            jsonKey: null,
            jsonValue: null,
            filesCount: 0,
            fileDetails: [] as Array<{ fieldname: string; size: number }>,
            parsedDataKeys: [],
            parsedDataFull: null as any,
            parsedDataStructure: null as any,
            finalChangeRequestKeys: [],
            finalChangeRequest: null as any,
            error: null as any,
        };

        try {
            const token = authHeader?.replace("Bearer ", "") ?? "";

            // Try to parse multipart data if it exists
            // In production, Fastify provides isMultipart(), but in tests it might not be available
            const isMultipartRequest =
                typeof request.isMultipart === "function" ? request.isMultipart() : false;
            debug.isMultipart = isMultipartRequest;

            let body: Record<string, any> = {};
            const files: Array<{ buffer: Buffer; fieldname: string }> = [];

            if (isMultipartRequest && typeof request.parts === "function") {
                // Production path: parse Fastify multipart data
                const parts = request.parts();

                for await (const part of parts) {
                    if (part.type === "file") {
                        const buffer = await part.toBuffer();
                        files.push({ buffer, fieldname: part.fieldname });
                        debug.fileDetails.push({ fieldname: part.fieldname, size: buffer.length });
                    } else {
                        body[part.fieldname] = part.value as string;
                    }
                }
            } else {
                // Fallback: check if body is already parsed (test environment)
                body = (request.body as any) || {};

                // In test environment, files might be in the body as Buffer objects
                // Extract them based on the __file__ naming pattern
                Object.keys(body).forEach((key) => {
                    if (key.includes("__file__") && Buffer.isBuffer(body[key])) {
                        files.push({
                            buffer: body[key],
                            fieldname: key,
                        });
                        debug.fileDetails.push({ fieldname: key, size: body[key].length });
                    }
                });
            }

            // Track parsed body state
            debug.bodyKeys = Object.keys(body);
            debug.filesCount = files.length;

            // Capture body content (excluding binary data for readability)
            debug.bodyContent = Object.keys(body).reduce((acc, key) => {
                if (!key.includes("__file__")) {
                    acc[key] =
                        typeof body[key] === "string" && body[key].length > 500
                            ? body[key].substring(0, 500) + "... (truncated)"
                            : body[key];
                }
                return acc;
            }, {} as any);

            // Check if this is a multipart form data request (with potential binary data)
            const jsonKey = Object.keys(body).find((key) => key.endsWith("__json"));
            debug.hasJsonKey = !!jsonKey;
            debug.jsonKey = jsonKey;

            if (jsonKey) {
                // Parse the main JSON payload
                // Handle case where LFormData may have appended JSON multiple times (for merging)
                const jsonValue = body[jsonKey];
                const jsonString = Array.isArray(jsonValue)
                    ? jsonValue[jsonValue.length - 1]
                    : String(jsonValue);

                // Track raw JSON value
                debug.jsonValue =
                    jsonString.length > 1000
                        ? jsonString.substring(0, 1000) + "... (truncated)"
                        : jsonString;

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
                debug.parsedDataKeys = Object.keys(parsedData);
                debug.parsedDataFull = JSON.parse(JSON.stringify(parsedData)); // Deep clone for debugging
                debug.parsedDataStructure = {
                    id: parsedData.id,
                    idType: typeof parsedData.id,
                    hasDoc: !!parsedData.doc,
                    docType: typeof parsedData.doc,
                    apiVersion: parsedData.apiVersion,
                };

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

                debug.finalChangeRequestKeys = Object.keys(changeRequest);
                debug.finalChangeRequest = {
                    full: JSON.parse(JSON.stringify(changeRequest)), // Complete object for inspection
                    id: changeRequest.id,
                    idType: typeof changeRequest.id,
                    hasDoc: !!changeRequest.doc,
                    docType: typeof changeRequest.doc,
                    docKeys: changeRequest.doc ? Object.keys(changeRequest.doc) : [],
                    apiVersion: changeRequest.apiVersion,
                };

                return this.changeRequestService.changeRequest(changeRequest, token);
            }

            // If it is just a JSON object (not multipart), validate it correctly
            await validateApiVersion(body.apiVersion);
            // Clean prototype pollution from the body before processing
            const cleanedBody = removeDangerousKeys(body);
            return this.changeRequestService.changeRequest(cleanedBody, token);
        } catch (error) {
            // Capture error details
            debug.error = {
                message: error.message,
                name: error.name,
                stack: error.stack,
                // For class-validator errors
                constraints: error.constraints || null,
                validationErrors: error.response?.message || null,
            };

            // Return detailed debug information in the error response
            throw new Error(
                `ChangeRequest processing failed. Debug info: ${JSON.stringify(
                    debug,
                    null,
                    2,
                )}. Error: ${error.message}`,
            );
        }
    }
}
