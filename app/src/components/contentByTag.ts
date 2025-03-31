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
        // Add new tags to the result
        tags.value.forEach((tag) => {
            const sorted = content.value
                .filter((c) => c.publishDate && c.parentTags.includes(tag.parentId))
                .sort((a, b) => (a.publishDate ?? 0) - (b.publishDate ?? 0));

            if (sorted.length) {
                const index = result.value.findIndex((r) => r.tag._id === tag._id);

                if (index !== -1) {
                    Object.assign(result.value[index], {
                        newestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    });
                } else {
                    result.value.push({
                        tag,
                        newestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    });
                }

                result.value.sort((a, b) => b.newestContentDate - a.newestContentDate);
            } else {
                const index = result.value.findIndex((r) => r.tag._id === tag._id);

                if (index !== -1) {
                    result.value.splice(index, 1);
                }
            }
        });
    });

    return result;
};
