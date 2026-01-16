import { Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ChangeRequestService } from "./changeRequest.service";
import { FastifyRequest } from "fastify";
import { MediaType } from "../enums";
import { detectFileType } from "../util/fileTypeDetection";

@Controller("changerequest")
export class ChangeRequestController {
    constructor(private readonly changeRequestService: ChangeRequestService) {}

    @Post()
    @UseGuards(AuthGuard)
    async handleChangeRequest(
        @Req() request: FastifyRequest,
        @Headers("Authorization") authHeader: string,
    ) {
        const token = authHeader?.replace("Bearer ", "") ?? "";

        // Check if this is a multipart request
        if (request.isMultipart()) {
            const parts = request.parts();
            const fields: Record<string, string> = {};
            const files: Array<{ buffer: Buffer; fieldname: string }> = [];

            for await (const part of parts) {
                if (part.type === "file") {
                    const buffer = await part.toBuffer();
                    files.push({ buffer, fieldname: part.fieldname });
                } else {
                    fields[part.fieldname] = part.value as string;
                }
            }

            if (files.length || typeof fields["changeRequestDoc-JSON"] === "string") {
                const apiVersion = fields["changeRequestApiVersion"];
                await validateApiVersion(apiVersion);

                const changeReqId = JSON.parse(fields["changeRequestId"]);
                const parsedDoc = JSON.parse(fields["changeRequestDoc-JSON"]);

                //Only parent documents (Posts and Tags) can have files uploaded,
                //Child documents only have a reference to the parent document's fileCollection field
                //without this check it could lead to unexpected behavior or critical errors

                // Clear any existing uploadData (it's only for new uploads, not for editing)
                if (parsedDoc.imageData?.uploadData) {
                    parsedDoc.imageData.uploadData = [];
                }
                if (parsedDoc.media?.uploadData) {
                    parsedDoc.media.uploadData = [];
                }

                if (files.length > 0) {
                    const imageUploadData = [];
                    const mediaUploadData = [];

                    // Better: use for..of with entries() instead of indexOf to await properly
                    for (const [index, file] of files.entries()) {
                        const filePreset = fields[`${index}-changeRequestDoc-files-preset`];
                        const languageId = fields[`${index}-changeRequestDoc-files-languageId`];

                        const fileType = await detectFileType(new Uint8Array(file.buffer));

                        if (!fileType) continue;

                        const isVideo = fileType.mime.startsWith(`${MediaType.Video}/`);
                        const isAudio = fileType.mime.startsWith(`${MediaType.Audio}/`);

                        if (fileType.mime.startsWith("image/")) {
                            // ImageUploadDto: fileData and preset only (no filename!)
                            imageUploadData.push({
                                fileData: file.buffer,
                                preset: filePreset,
                            });
                        } else if (isVideo || isAudio) {
                            const hlsUrl = fields[`${index}-changeRequestDoc-hlsUrl`];
                            if (hlsUrl) {
                                if (!parsedDoc.media) {
                                    parsedDoc.media = { fileCollections: [], uploadData: [] };
                                }
                                parsedDoc.media.hlsUrl = hlsUrl;
                            }

                            // MediaUploadDataDto: fileData, preset, mediaType, languageId
                            mediaUploadData.push({
                                fileData: file.buffer,
                                preset: filePreset,
                                mediaType: isVideo ? MediaType.Video : MediaType.Audio,
                                languageId: languageId,
                            });
                        }
                    }

                    // Assign image uploads to imageData.uploadData
                    if (imageUploadData.length > 0) {
                        if (!parsedDoc.imageData) {
                            parsedDoc.imageData = { fileCollections: [], uploadData: [] };
                        }
                        parsedDoc.imageData.uploadData = imageUploadData;
                    }

                    // Assign media uploads to media.uploadData
                    if (mediaUploadData.length > 0) {
                        if (!parsedDoc.media) {
                            parsedDoc.media = { fileCollections: [], uploadData: [] };
                        }
                        parsedDoc.media.uploadData = mediaUploadData;
                    }
                }

                const changeRequest: ChangeReqDto = {
                    id: changeReqId,
                    doc: parsedDoc,
                    apiVersion,
                };

                return this.changeRequestService.changeRequest(changeRequest, token);
            }
        }

        // If it is just a JSON object (not multipart), validate it correctly
        const body = request.body as any;
        await validateApiVersion(body.apiVersion);
        return this.changeRequestService.changeRequest(body, token);
    }
}
