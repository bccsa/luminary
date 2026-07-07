import { ref, watch, type Ref, type ShallowRef } from "vue";
import { type ContentDto } from "luminary-shared";

export type ContentByTag = {
    tag: ContentDto;
    newestContentDate: number;
    content: Array<ContentDto>;
};

/**
 * Sort content by tag
 * @param content
 * @param tags
 * @returns a Vue ref of type ContentByTag[]
 */
export const contentByTag = (
    content: Ref<ContentDto[]> | ShallowRef<ContentDto[]>,
    tags: Ref<ContentDto[]> | ShallowRef<ContentDto[]>,
    options: { includeUntagged?: boolean; dedupeAcrossTags?: boolean } = {},
) => {
    const result = {
        tagged: ref<ContentByTag[]>([]),
        untagged: ref<ContentDto[]>([]),
    };

    watch(
        [content, tags],
        () => {
            // Remove tags that no longer exist
            for (let i = result.tagged.value.length - 1; i >= 0; i--) {
                if (!tags.value.some((c) => c._id === result.tagged.value[i].tag._id)) {
                    result.tagged.value.splice(i, 1);
                }
            }

            const matchesTag = (c: ContentDto, tag: ContentDto) =>
                !!c.publishDate && !!c.parentTags && c.parentTags.includes(tag.parentId);

            // When deduping, process the tag with the fewest matches first so a broad
            // tag (e.g. "People in the Bible") doesn't claim items a niche tag needs.
            const tagOrder = options.dedupeAcrossTags
                ? [...tags.value].sort(
                      (a, b) =>
                          content.value.filter((c) => matchesTag(c, a)).length -
                          content.value.filter((c) => matchesTag(c, b)).length,
                  )
                : tags.value;
            const claimed = new Set<string>();

            // Add new tags to the result
            tagOrder.forEach((tag) => {
                const filtered = content.value.filter(
                    (c) => matchesTag(c, tag) && !claimed.has(c._id),
                );

                if (options.dedupeAcrossTags) {
                    filtered.forEach((c) => claimed.add(c._id));
                }

                const isPinned = tag.parentPinned && tag.parentPinned > 0;

                const sorted = filtered.sort((a, b) => {
                    // Check if this tag/category is pinned (parentPinned > 0)
                    return isPinned
                        ? (b.publishDate ?? 0) - (a.publishDate ?? 0) // Pinned: descending (newest first)
                        : (a.publishDate ?? 0) - (b.publishDate ?? 0); // Unpinned: ascending (oldest first)
                });

                if (sorted.length) {
                    const index = result.tagged.value.findIndex((r) => r.tag._id === tag._id);

                    // For newestContentDate, always use the actual newest (highest) date
                    const newestContentDate = Math.max(...filtered.map((c) => c.publishDate ?? 0));

                    if (index !== -1) {
                        Object.assign(result.tagged.value[index], {
                            newestContentDate,
                            content: sorted,
                        });
                    } else {
                        result.tagged.value.push({
                            tag,
                            newestContentDate,
                            content: sorted,
                        });
                    }

                    result.tagged.value.sort((a, b) => b.newestContentDate - a.newestContentDate);
                } else {
                    // Remove tags with no content
                    const index = result.tagged.value.findIndex((r) => r.tag._id === tag._id);

                    if (index !== -1) {
                        result.tagged.value.splice(index, 1);
                    }
                }
            });

            // get untagged content
            if (options.includeUntagged) {
                result.untagged.value = content.value.filter(
                    (c) =>
                        !c.parentTags ||
                        !c.parentTags.some((t) => tags.value.some((tag) => tag.parentId === t)),
                );
            }
        },
        { immediate: true, deep: true },
    );

    return result;
};
