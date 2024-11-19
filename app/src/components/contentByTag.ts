import { ref, watchEffect, type Ref } from "vue";
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
    content: Ref<ContentDto[]>,
    tags: Ref<ContentDto[]>,
): Ref<ContentByTag[]> => {
    const result = ref<ContentByTag[]>([]);

    watchEffect(() => {
        // Clear removed tags
        for (const r of result.value) {
            if (!tags.value.some((c) => c._id === r.tag._id)) {
                result.value = result.value.filter((f) => f.tag._id !== r.tag._id);
            }
        }

        // Add new tags to the result
        tags.value.forEach((tag) => {
            const sorted = content.value
                .filter((c) => c.publishDate && c.parentTags.includes(tag.parentId))
                .sort((a, b) => {
                    if (!a.publishDate) return 1;
                    if (!b.publishDate) return -1;
                    if (a.publishDate < b.publishDate) return -1;
                    if (a.publishDate > b.publishDate) return 1;
                    return 0;
                });

            if (sorted.length) {
                const index = result.value.findIndex((r) => r.tag._id === tag._id);
                // Replace the tag if it already exists. For some or other reason the tags are
                // duplicated on initial page load, and this logic prevents showing duplicate tags.
                if (index !== -1) {
                    result.value[index] = {
                        tag: tag,
                        newestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    };
                } else {
                    result.value.push({
                        tag: tag,
                        newestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    });

                    result.value.sort((a, b) => {
                        if (a.newestContentDate > b.newestContentDate) return -1;
                        if (a.newestContentDate < b.newestContentDate) return 1;
                        return 0;
                    });
                }
            }
        });
    });

    return result;
};
