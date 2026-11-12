import { computed, type ComputedRef } from "vue";
import type { ContentQueryState } from "@/composables/useContentQuery";

/** Whether a lookup can be drawn from: it has returned something, or settled on nothing. */
export const hasAnswered = (lookup: ContentQueryState) =>
    lookup.output.value.length > 0 || !lookup.isFetching.value;

/**
 * Whether an activity panel may draw its list. Before everything it draws from has
 * answered, the list would show only part of the activity, or say there is none, and then
 * change in front of the reader. Once true it stays true, so a later change is added to
 * the list on screen instead of blanking it.
 */
export function useShownOnceLoaded(isLoaded: () => boolean): ComputedRef<boolean> {
    let shown = false;
    return computed(() => shown || (shown = isLoaded()));
}
