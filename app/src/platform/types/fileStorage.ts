import type { InjectionKey } from "vue";

export interface FileStorageService {
    saveFile(contentId: string, data: Blob): Promise<void>;
    hasFile(contentId: string): Promise<boolean>;
    getFileUri(contentId: string): Promise<string | null>;
    getFileSize(contentId: string): Promise<number | null>;
    deleteFile(contentId: string): Promise<void>;
}

export const FileStorageKey: InjectionKey<FileStorageService> = Symbol("file-storage");
