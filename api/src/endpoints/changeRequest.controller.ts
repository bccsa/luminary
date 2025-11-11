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

        // Check if this is a multipart form data request (with potential binary data)
        const jsonKey = Object.keys(body).find((key) => key.endsWith("-JSON"));

        if (files?.length || jsonKey) {
            const apiVersion = body["apiVersion"];
            await validateApiVersion(apiVersion);

            // Parse the main JSON payload
            const parsedData = JSON.parse(body[jsonKey]);

            // Patch binary data (file buffers) back into null placeholders
            if (files.length > 0) {
                const baseKey = jsonKey.replace("-JSON", "");

                // Reconstruct file objects with metadata from form fields
                const fileObjects = files.map((file, index) => {
                    const filePrefix = `${index}-${baseKey}-files-`;
                    const fileObj: Record<string, any> = {};

                    // Extract all metadata fields for this file
                    Object.keys(body).forEach((key) => {
                        if (key.startsWith(filePrefix)) {
                            const fieldName = key.replace(filePrefix, "");

                            // Skip the fileData field - we'll add the buffer separately
                            if (fieldName === "fileData") return;

                            const value = body[key];

                            console.log(
                                `Extracting metadata: ${fieldName}=${value} (type: ${typeof value})`,
                            );

                            // Convert string values back to their original types
                            if (!isNaN(Number(value)) && value !== "") {
                                fileObj[fieldName] = Number(value);
                            } else if (value === "true" || value === "false") {
                                fileObj[fieldName] = value === "true";
                            } else {
                                fileObj[fieldName] = value;
                            }
                        }
                    });

                    // Add the binary data from the uploaded file
                    fileObj.fileData = file.buffer;

                    console.log(
                        `File ${index}: buffer length=${
                            file.buffer.length
                        }, buffer type=${typeof file.buffer}, is Buffer=${Buffer.isBuffer(
                            file.buffer,
                        )}`,
                    );

                    return fileObj;
                });

                this.patchFileData(parsedData, fileObjects);
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
        return this.changeRequestService.changeRequest(body, token);
    }

    /**
     * Recursively find null values and replace them with file objects in order
     */
    private patchFileData(obj: any, fileObjects: any[]): void {
        let fileIndex = 0;

        const patch = (value: any) => {
            if (!value || typeof value !== "object") return;

            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    if (value[i] === null && fileIndex < fileObjects.length) {
                        value[i] = fileObjects[fileIndex++];
                    } else if (typeof value[i] === "object") {
                        patch(value[i]);
                    }
                }
            } else {
                for (const key of Object.keys(value)) {
                    // Prevent prototype pollution
                    // https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution
                    // ChangeReqDto has doc: any with only @IsObject() validation
                    // An attacker can exploit this vulnerability by passing a specially crafted object that modifies the prototype of built-in objects.
                    // ( Class-validator won't detect this ) Class-validator doesn't recursively check for dangerous keys like __proto__
                    if (key === "__proto__" || key === "constructor" || key === "prototype") {
                        continue;
                    }

                    if (value[key] === null && fileIndex < fileObjects.length) {
                        value[key] = fileObjects[fileIndex++];
                    } else if (typeof value[key] === "object") {
                        patch(value[key]);
                    }
                }
            }
        };

        patch(obj);
    }
}
