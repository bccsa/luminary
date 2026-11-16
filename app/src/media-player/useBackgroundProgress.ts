import { inject, onBeforeUnmount, onMounted } from "vue";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import { applyBackgroundMediaProgress } from "@/contentProgress";

/**
 * Applies what the platform's player kept while the app was in the background, where the page's own saves stop:
 * at start, for a process that ended out there, and on every return.
 */
export function useBackgroundProgress(): void {
    const take = inject(VideoPlayerKey, undefined)?.takeBackgroundProgress;
    if (!take) return;

    const pickUp = () =>
        void take().then(
            (record) => record && applyBackgroundMediaProgress(record),
            () => undefined,
        );
    const onVisibility = () => {
        if (document.visibilityState === "visible") pickUp();
    };
    onMounted(() => {
        document.addEventListener("visibilitychange", onVisibility);
        pickUp();
    });
    onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisibility));
}
