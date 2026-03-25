import { inject } from "vue";
import { AudioPlayerKey, type AudioPlayerService } from "@/platform/types";

export function useAudioPlayer(): AudioPlayerService {
    const service = inject(AudioPlayerKey);
    if (!service) {
        throw new Error(
            "[useAudioPlayer] No AudioPlayerService found. " +
                "Ensure app.use(WebPlatformPlugin) is called in main.ts before app.mount().",
        );
    }
    return service;
}

