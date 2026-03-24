import { inject } from "vue";
import { FileStorageKey, type FileStorageService } from "@/platform/types";

export function useFileStorage(): FileStorageService {
    const service = inject(FileStorageKey);
    if (!service) {
        throw new Error(
            "[useFileStorage] No FileStorageService found. " +
                "Ensure app.use(WebPlatformPlugin) is called in main.ts before app.mount().",
        );
    }
    return service;
}
