import { ref, onMounted, onUnmounted } from "vue";
import type { Uuid } from "luminary-shared";

export type WatchedMediaEntry = { mediaId: string; contentId: Uuid };

function readWatchedMediaIds(): WatchedMediaEntry[] {
    try {
        const progressList = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        return Array.isArray(progressList) ? progressList : [];
    } catch {
        return [];
    }
}

/** Reactive, cross-tab-synced view of the `mediaProgress` localStorage ring buffer —
 *  the shared resume-position store both AudioPlayer and VideoPlayer write to via
 *  `setMediaProgress()`. Consumed by both ContinueWatching and ContinueListening. */
export function useWatchedMediaIds() {
    const mediaProgressRef = ref(readWatchedMediaIds());

    function update() {
        mediaProgressRef.value = readWatchedMediaIds();
    }

    onMounted(() => {
        window.addEventListener("storage", update);
        const interval = setInterval(update, 5000);
        onUnmounted(() => {
            window.removeEventListener("storage", update);
            clearInterval(interval);
        });
    });

    return mediaProgressRef;
}
