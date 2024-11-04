import { ref, watchEffect, type Ref } from "vue";
import { type ContentDto } from "luminary-shared";

export type ContentByCategory = {
    category: ContentDto;
    latestContentDate: number;
    content: Array<ContentDto>;
};

/**
 * Sort content by category
 * @param content
 * @param categories
 * @returns a Vue ref of type ContentByCategory[]
 */
export const contentByCategory = (
    content: Ref<ContentDto[]>,
    categories: Ref<ContentDto[]>,
): Ref<ContentByCategory[]> => {
    const result = ref<ContentByCategory[]>([]);

    watchEffect(() => {
        // Clear removed categories
        for (const r of result.value) {
            if (!categories.value.some((c) => c._id === r.category._id)) {
                result.value = result.value.filter((f) => f.category._id !== r.category._id);
            }
        }

        // Add new categories to the result
        categories.value.forEach((category) => {
            const sorted = content.value
                .filter((c) => c.publishDate && c.parentTags.includes(category.parentId))
                .sort((a, b) => {
                    if (!a.publishDate) return 1;
                    if (!b.publishDate) return -1;
                    if (a.publishDate < b.publishDate) return -1;
                    if (a.publishDate > b.publishDate) return 1;
                    return 0;
                });

            if (sorted.length) {
                const index = result.value.findIndex((r) => r.category._id === category._id);
                // Replace the category if it already exists. For some or other reason the categories are
                // duplicated on initial page load, and this logic prevents showing duplicate categories.
                if (index !== -1) {
                    result.value[index] = {
                        category,
                        latestContentDate: sorted[sorted.length - 1].publishDate || 0,
                        content: sorted,
                    };
                } else {
                    result.value.push({
                        category,
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
