import { inject, onBeforeUnmount, onMounted } from "vue";
import { db, type ContentDto } from "luminary-shared";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import type { VideoPlayerService } from "@/build-time/contracts/video-player/contract";
import { applyBackgroundMediaProgress } from "@/contentProgress";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { recordMediaCompletion } from "./mediaCompletion";

type Take = VideoPlayerService["takeBackgroundProgress"];

/**
 * Applies what the platform's player kept while the app was in the background, where the page's own saves stop.
 * Scoring a completion is only for a process that ended out there: a live page's player scores it itself.
 */
export async function applyBackgroundProgress(
    take: Take,
    { scoreCompletion = false }: { scoreCompletion?: boolean } = {},
): Promise<void> {
    if (!take) return;
    const record = await take().catch(() => null);
    const applied = record && applyBackgroundMediaProgress(record);
    if (!applied || !scoreCompletion) return;

    // The page scores at this fraction too, so a position it had already passed was scored there.
    const threshold = (applied.duration * affinityConfig.value.mediaCompletionPercent) / 100;
    if (applied.from >= threshold || applied.to < threshold) return;
    const content = await db.get<ContentDto>(applied.contentId).catch(() => undefined);
    if (content) recordMediaCompletion(content);
}

/** On every return to the foreground; the start is handled before the app mounts (see `main.ts`). */
export function useBackgroundProgress(): void {
    const take = inject(VideoPlayerKey, undefined)?.takeBackgroundProgress;
    if (!take) return;

    const onVisibility = () => {
        if (document.visibilityState === "visible") void applyBackgroundProgress(take);
    };
    onMounted(() => document.addEventListener("visibilitychange", onVisibility));
    onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisibility));
}
