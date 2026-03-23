import { inject } from "vue";
import { MediaPlayerKey, type MediaPlayerService } from "@/platform/types";

/**
 * Returns the platform-specific media player service registered by
 * WebPlatformPlugin or CapacitorPlatformPlugin at app startup.
 *
 * Throws if called before a platform plugin has been installed, so
 * misconfiguration surfaces immediately rather than as a silent runtime error.
 */
export function useMediaPlayer(): MediaPlayerService {
    const player = inject(MediaPlayerKey);

    if (!player) {
        throw new Error(
            "useMediaPlayer() called before a platform plugin was installed. " +
                "Make sure app.use(WebPlatformPlugin) or app.use(CapacitorPlatformPlugin) " +
                "is called in main.ts before app.mount().",
        );
    }

    return player;
}
