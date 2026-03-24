import { inject } from "vue";
import { DownloadMetadataKey, type DownloadMetadataService } from "@/platform/types";

export function useDownloadMetadata(): DownloadMetadataService {
    const service = inject(DownloadMetadataKey);
    if (!service) {
        throw new Error(
            "[useDownloadMetadata] No DownloadMetadataService found. " +
                "Ensure app.use(WebPlatformPlugin) is called in main.ts before app.mount().",
        );
    }
    return service;
}
