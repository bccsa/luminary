import { File } from "multer";
import { MediaType } from "../enums";

type GenericUploadData = {
    hlsUrl?: string;
    mediaType?: MediaType;
    languageId?: string;
};

export function createUploadData(
    file: File,
    preset: string,
    data: GenericUploadData,
): Record<string, any> {
    const uploadData: Record<string, any> = {};

    if (data.mediaType) {
        if (data.hlsUrl) {
            uploadData.hlsUrl = data.hlsUrl;
        }
        uploadData.mediaType = data.mediaType;
        uploadData.languageId = data.languageId;
    }

    uploadData.preset = preset;
    uploadData.fileData = file.buffer;

    return uploadData;
}
