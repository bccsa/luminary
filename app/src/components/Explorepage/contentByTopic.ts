import { ref, watchEffect, type Ref } from "vue";
import { type ContentDto } from "luminary-shared";

export type ContentByCategory = {
    topic: ContentDto;
    latestContentDate: number;
    content: Array<ContentDto>;
};

/**
 * Sort content by category
 * @param content
 * @param topics
 * @returns a Vue ref of type ContentByCategory[]
 */
export const contentByTopic = (
    content: Ref<ContentDto[]>,
    topics: Ref<ContentDto[]>,
): Ref<ContentByCategory[]> => {
    const result = ref<ContentByCategory[]>([]);

    watchEffect(() => {
        // Clear removed topics
        for (const r of result.value) {
            if (!topics.value.some((c) => c._id === r.topic._id)) {
                result.value = result.value.filter((f) => f.topic._id !== r.topic._id);
            }
        }

        // Add new topics to the result
        topics.value.forEach((topic) => {
            const sorted = content.value
                .filter((c) => c.publishDate && c.parentTags.includes(topic.parentId))
                .sort((a, b) => {
                    if (!a.publishDate) return 1;
                    if (!b.publishDate) return -1;
                    if (a.publishDate < b.publishDate) return -1;
                    if (a.publishDate > b.publishDate) return 1;
                    return 0;
                });

            if (sorted.length) {
                const index = result.value.findIndex((r) => r.topic._id === topic._id);
                // Replace the category if it already exists. For some or other reason the categories are
                // duplicated on initial page load, and this logic prevents showing duplicate categories.
                if (index !== -1) {
                    result.value[index] = {
                        topic: topic,
                        latestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    };
                } else {
                    result.value.push({
                        topic: topic,
                        latestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    });

                    result.value.sort((a, b) => {
                        if (a.latestContentDate > b.latestContentDate) return -1;
                        if (a.latestContentDate < b.latestContentDate) return 1;
                        return 0;
                    });
                }
            }
        });
    });

    return result;
};
