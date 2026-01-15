import { Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateApiVersion } from "../validation/apiVersion";
import { AuthGuard } from "../auth/auth.guard";
import { ChangeRequestService } from "./changeRequest.service";
import { FastifyRequest } from "fastify";

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
                if (files.length > 0) {
                    const uploadData = [];

                    files.forEach((file, index) => {
                        // TODO: change after #1208 is implemented
                        const fileName = fields[`${index}-changeRequestDoc-files-filename`];
                        const filePreset = fields[`${index}-changeRequestDoc-files-preset`];

                        uploadData.push({
                            fileData: file.buffer,
                            filename: fileName,
                            preset: filePreset,
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
        }

        // If it is just a JSON object (not multipart), validate it correctly
        const body = request.body as any;
        await validateApiVersion(body.apiVersion);
        return this.changeRequestService.changeRequest(body, token);
    }
}
