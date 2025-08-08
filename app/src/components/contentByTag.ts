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
    options: { includeUntagged?: boolean } = {},
) => {
    const result = {
        tagged: ref<ContentByTag[]>([]),
        untagged: ref<ContentDto[]>([]),
    };

    watchEffect(() => {
        // Remove tags that no longer exist
        for (let i = result.tagged.value.length - 1; i >= 0; i--) {
            if (!tags.value.some((c) => c._id === result.tagged.value[i].tag._id)) {
                result.tagged.value.splice(i, 1);
            }
        }

        // Add new tags to the result
        tags.value.forEach((tag) => {
            const sorted = content.value
                .filter((c) => c.publishDate && c.parentTags.includes(tag.parentId))
                .sort((a, b) => (b.publishDate ?? 0) - (a.publishDate ?? 0));

            if (sorted.length) {
                const index = result.tagged.value.findIndex((r) => r.tag._id === tag._id);

                if (index !== -1) {
                    Object.assign(result.tagged.value[index], {
                        newestContentDate: sorted[0].publishDate || 0,
                        content: sorted,
                    });
                } else {
                    result.tagged.value.push({
                        tag,
                        newestContentDate: sorted[0].publishDate || 0,
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
                (c) => !c.parentTags.some((t) => tags.value.some((tag) => tag.parentId === t)),
            );
        }
    });

    return result;
};
