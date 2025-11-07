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

            // Reconstruct binary data from uploaded files back into the document structure
            if (files.length > 0) {
                const baseKey = jsonKey.replace("-JSON", "");

                files.forEach((file, index) => {
                    const filePrefix = `${index}-${baseKey}-files-`;
                    const pathKey = `${filePrefix}path`;
                    const path = body[pathKey];

                    if (!path) {
                        throw new Error(`Missing path information for file at index ${index}`);
                    }

                    // Extract all metadata fields for this file
                    const fileMetadata: Record<string, any> = {};
                    Object.keys(body).forEach((key) => {
                        if (key.startsWith(filePrefix) && key !== pathKey) {
                            const fieldName = key.replace(filePrefix, "");
                            const value = body[key];

                            // Convert string values back to their original types if needed
                            if (fieldName === "width" || fieldName === "height") {
                                fileMetadata[fieldName] = parseInt(value, 10);
                            } else if (value === "true" || value === "false") {
                                fileMetadata[fieldName] = value === "true";
                            } else {
                                fileMetadata[fieldName] = value;
                            }
                        }
                    });

                    // Add the binary data from the uploaded file
                    fileMetadata.fileData = file.buffer;

                    // Reconstruct the object at the specified path
                    this.setValueAtPath(parsedData, path, fileMetadata);
                });
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
     * Set a value at a specific path in an object
     * Supports paths like "images[0].thumbnail" or "media.video"
     */
    private setValueAtPath(obj: any, path: string, value: any): void {
        const parts = path.split(/\.|\[|\]/).filter((p) => p !== "");
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const nextPart = parts[i + 1];
            const isArrayIndex = /^\d+$/.test(nextPart);

            if (!(part in current)) {
                current[part] = isArrayIndex ? [] : {};
            }
            current = current[part];
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
    }
}
