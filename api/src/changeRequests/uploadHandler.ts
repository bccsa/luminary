import { File } from "multer";
import { MediaType } from "../enums";

type GenericUploadData = {
    filename?: string;
    hlsUrl?: string;
    mediaType?: MediaType;
};

export function createUploadData(
    file: File,
    preset: string,
    data: GenericUploadData,
): Record<string, any> {
    const uploadData: Record<string, any> = {};

    // Prefer provided filename; otherwise fall back to the original upload name
    const effectiveFilename = data.filename || file.originalname;
    if (effectiveFilename) uploadData.filename = effectiveFilename;

    if (data.mediaType) {
        if (data.hlsUrl) {
            uploadData.hlsUrl = data.hlsUrl;
        }
        uploadData.mediaType = data.mediaType;
    }

    uploadData.preset = preset;
    uploadData.fileData = file.buffer;

    return uploadData;
}
