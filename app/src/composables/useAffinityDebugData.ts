import { computed, type Ref } from "vue";
import { decay, DocType, affinityConfig, type AffinityProfile } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";

/**
 * Shared debug-view data for the two affinity-debug UIs (the persistent page and the
 * floating overlay): decayed per-tag scores sorted descending, plus a tag-id → title
 * lookup for display. Both callers pass their own `profile`/`now` refs so decay ticks
 * on their own timer and against their own profile source.
 */
export function useAffinityDebugData(profile: Ref<AffinityProfile | undefined>, now: Ref<number>) {
    const decayedEntries = computed(() => {
        const decayed = decay(profile.value, now.value, affinityConfig.value);
        return Object.entries(decayed.affinity).sort((a, b) => b[1] - a[1]);
    });

    const tagIds = computed(() => decayedEntries.value.map(([tagId]) => tagId));

    const tagContent = useContentQuery(
        () =>
            tagIds.value.length
                ? [{ parentId: { $in: tagIds.value } }, { parentType: DocType.Tag }]
                : [{ parentId: { $in: [] } }],
        { includeScheduled: false },
    );

    const tagTitleMap = computed(() => {
        const map = new Map<string, string>();
        for (const doc of tagContent.value) {
            if (doc.parentId && doc.title) {
                map.set(doc.parentId, doc.title);
            }
        }
        return map;
    });

    return { decayedEntries, tagTitleMap };
}

/** Bucket a rank into the label used across the debug UIs for "how likely is this tag to
 *  actually influence the retrieval seed". */
export function getPreviewTier(rank: number): string {
    if (rank >= 1 && rank <= 3) return "Core";
    if (rank >= 4 && rank <= 5) return "Strong";
    if (rank >= 6 && rank <= 10) return "Established";
    return "—";
}
