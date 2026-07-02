import { computed, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { type ContentDto } from "luminary-shared";

export type ContentByTag = {
    tag: ContentDto;
    newestContentDate: number;
    content: Array<ContentDto>;
};

/**
 * Group content by tag/category.
 *
 * Derived via `computed` (NOT a watcher) on purpose: Vue SSR does not run
 * watchers, only computeds/template render. The web/SSG build fills the source
 * refs in `onServerPrefetch` and then renders to string — a `computed` is
 * evaluated lazily at that render, so the grouped rows appear in the prerendered
 * HTML. A `watch(..., { immediate: true })` would compute once against the
 * still-empty refs and never re-run server-side, leaving the groups empty in the
 * static output (this was the bug). The sources (`useContentQuery` /
 * `useHybridQuery` results) update by ref reassignment, so the computed re-runs on
 * every live update too.
 *
 * @returns `{ tagged, untagged }` as read-only computed refs.
 */
export const contentByTag = (
    content: Ref<ContentDto[]> | ShallowRef<ContentDto[]>,
    tags: Ref<ContentDto[]> | ShallowRef<ContentDto[]>,
    options: { includeUntagged?: boolean } = {},
): { tagged: ComputedRef<ContentByTag[]>; untagged: ComputedRef<ContentDto[]> } => {
    const tagged = computed<ContentByTag[]>(() => {
        const out: ContentByTag[] = [];

        tags.value.forEach((tag) => {
            const filtered = content.value.filter(
                (c) => c.publishDate && c.parentTags && c.parentTags.includes(tag.parentId),
            );

            if (!filtered.length) return; // drop tags with no content

            const isPinned = !!tag.parentPinned && tag.parentPinned > 0;

            const sorted = [...filtered].sort((a, b) =>
                isPinned
                    ? (b.publishDate ?? 0) - (a.publishDate ?? 0) // Pinned: descending (newest first)
                    : (a.publishDate ?? 0) - (b.publishDate ?? 0), // Unpinned: ascending (oldest first)
            );

            // Always the actual newest (highest) date, regardless of pinned sort order.
            const newestContentDate = Math.max(...filtered.map((c) => c.publishDate ?? 0));

            out.push({ tag, newestContentDate, content: sorted });
        });

        out.sort((a, b) => b.newestContentDate - a.newestContentDate);

        return out;
    });

    const untagged = computed<ContentDto[]>(() => {
        if (!options.includeUntagged) return [];
        return content.value.filter(
            (c) =>
                !c.parentTags ||
                !c.parentTags.some((t) => tags.value.some((tag) => tag.parentId === t)),
        );
    });

    return { tagged, untagged };
};
