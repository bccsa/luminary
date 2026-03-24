import type { InjectionKey } from "vue";

export type DownloadStatus = "pending" | "downloading" | "completed" | "failed";

export type DownloadEntry = {
    contentId: string;
    status: DownloadStatus;
    progress: number;
    fileSize?: number;
};

export interface DownloadMetadataService {
    setDownload(entry: DownloadEntry): Promise<void>;
    getDownload(contentId: string): Promise<DownloadEntry | null>;
    setDownloadProgress(contentId: string, progress: number): Promise<void>;
    listDownloads(): Promise<DownloadEntry[]>;
    removeDownload(contentId: string): Promise<void>;
}

export const DownloadMetadataKey: InjectionKey<DownloadMetadataService> = Symbol(
    "download-metadata",
);
