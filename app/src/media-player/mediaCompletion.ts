import type { ContentDto } from "luminary-shared";
import { recordAffinity } from "@/recommendation/affinityStore";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { ensureUserActivity } from "@/userActivity/store";

/** Scores one finished playthrough of the post's media. */
export function recordMediaCompletion(content: Pick<ContentDto, "parentTags" | "parentId">): void {
    // Finishing a video is a strong engagement signal — weighted above a plain open.
    recordAffinity(content.parentTags, affinityConfig.value.eventWeight.completion);

    // mediaProgress is a 10-slot ring buffer used only to resume playback, not a
    // history — record completion in the activity history instead.
    void ensureUserActivity({ type: "viewed", parentId: content.parentId });
}
