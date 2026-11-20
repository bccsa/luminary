import { computed } from "vue";
import type { HighlightColor } from "luminary-shared";
import { HIGHLIGHT_COLORS } from "@/util/highlightRanges";
import { useUserActivity } from "@/userActivity/useUserActivity";

/** Only the colours actually used, in the palette's order, so the filter has no dead chips. */
export function useHighlightColours() {
    const highlighted = useUserActivity("highlighted");

    return computed(() =>
        (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).filter((c) =>
            highlighted.value.some((row) =>
                row.payload?.ranges?.some((range) => range.color === c),
            ),
        ),
    );
}
