import type { ContentDto } from "luminary-shared";

/** A per-language audio file on a content parent. */
export type AudioFile = {
    languageId: string;
    fileUrl: string;
    bitrate: number;
    mediaType: string;
    processingProgress?: number;
};

/** The parent's audio files, which the shared media type does not declare. */
export function audioFilesOf(content: ContentDto | undefined): AudioFile[] | undefined {
    return (content?.parentMedia as { fileCollections?: AudioFile[] } | undefined)?.fileCollections;
}
