import type { FileStorageService } from "@/platform/types";

export class WebFileStorageService implements FileStorageService {
    async saveFile(_contentId: string, _data: Blob): Promise<void> {}
    async hasFile(_contentId: string): Promise<boolean> { return false; }
    async getFileUri(_contentId: string): Promise<string | null> { return null; }
    async getFileSize(_contentId: string): Promise<number | null> { return null; }
    async deleteFile(_contentId: string): Promise<void> {}
}
