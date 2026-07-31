import { computed, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { type ContentDto } from "luminary-shared";

export type ContentByTag = {
    tag: ContentDto;
    newestContentDate: number;
    content: Array<ContentDto>;
};

/**
 * Group content by tag/category. Derived via `computed` (not a watcher) because Vue SSR only runs computeds/template render, so the grouped rows appear in the prerendered HTML.
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
