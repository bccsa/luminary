import { inject } from "vue";
import { MediaPlayerKey, type MediaPlayerService } from "@/platform/types";

export function useMediaPlayer(): MediaPlayerService {
    const service = inject(MediaPlayerKey);
    if (!service) {
        throw new Error(
            "[useMediaPlayer] No MediaPlayerService found. " +
                "Ensure app.use(WebPlatformPlugin) is called in main.ts before app.mount().",
        );
    }
    return service;
}
