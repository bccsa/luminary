import type { DownloadEntry, DownloadMetadataService } from "@/platform/types";

const STORAGE_KEY = "luminary:downloads";

export class WebDownloadMetadataService implements DownloadMetadataService {
    private readAll(): Record<string, DownloadEntry> {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? (JSON.parse(raw) as Record<string, DownloadEntry>) : {};
        } catch {
            return {};
        }
    }

    private writeAll(catalogue: Record<string, DownloadEntry>): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogue));
    }

    async setDownload(entry: DownloadEntry): Promise<void> {
        const catalogue = this.readAll();
        catalogue[entry.contentId] = entry;
        this.writeAll(catalogue);
    }

    async getDownload(contentId: string): Promise<DownloadEntry | null> {
        return this.readAll()[contentId] ?? null;
    }

    async setDownloadProgress(contentId: string, progress: number): Promise<void> {
        const entry = await this.getDownload(contentId);
        if (entry) await this.setDownload({ ...entry, progress });
    }

    async listDownloads(): Promise<DownloadEntry[]> {
        return Object.values(this.readAll());
    }

    async removeDownload(contentId: string): Promise<void> {
        const catalogue = this.readAll();
        delete catalogue[contentId];
        this.writeAll(catalogue);
    }
}
