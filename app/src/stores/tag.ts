import { defineStore } from "pinia";
import { ContentStatus, TagType, type Tag } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { TagRepository } from "@/db/repositories/tagRepository";
import { usePostStore } from "./post";

/**
 * Tag filter options.
 * @property topLevelOnly - Only return top level tags (i.e. tags that are not tagged with other tags of the same tag type).
 * @property excludeEmpty - Include tags that are not in use (no posts or tags tagged with the given tag).
 */
type tagFilterOptions = {
    topLevelOnly?: boolean;
    includeEmpty?: boolean;
};

/**
 * Tag sort options.
 * If sorting by publishDate, the newest post tagged with the tag will be used for sorting.
 * @property sortBy - Sort by title or publishDate.
 * @property sortOrder - Sort in ascending or descending order.
 */
type tagSortOptions = {
    sortBy?: "title" | "publishDate";
    sortOrder?: "asc" | "desc";
    pinnedFirst?: boolean;
};

/**
 * Tags query filter and sort options
 */
export type tagQueryOptions = {
    filterOptions?: tagFilterOptions;
    sortOptions?: tagSortOptions;
};

export const useTagStore = defineStore("category", () => {
    const tagRepository = new TagRepository();

    const tags: Readonly<Ref<Tag[] | undefined>> = useObservable(
        liveQuery(async () => {
            const tags = await tagRepository.getAll();
            return new Promise((resolve) => {
                resolve(
                    tags.filter((tag) => {
                        return tag.content[0]?.status == ContentStatus.Published;
                    }),
                );
            });
        }) as unknown as Observable<Tag[]>,
    );

    const tag = computed(() => {
        return (slug: string) => {
            return tags.value?.find((p) => p.content[0].slug == slug);
        };
    });

    /**
     * Get tags by tag type. Only return tags that have posts.
     */
    const tagsByTagType = computed(() => {
        return (tagType: TagType, queryOptions?: tagQueryOptions) => {
            // Get pinned tags
            const res = tagQuery(tags, tagType, queryOptions, "pinned");

            // Get unpinned tags
            return res.concat(tagQuery(tags, tagType, queryOptions, "unpinned"));
        };
    });

    return { tag, tags, tagsByTagType };
});

function tagQuery(
    tags: Readonly<Ref<Tag[] | undefined>>,
    tagType: TagType,
    queryOptions?: tagQueryOptions,
    pinned?: "pinned" | "unpinned" | "any",
) {
    const postStore = usePostStore();
    // query with optional filtering
    let res = tags.value?.filter((t) => {
        const posts = postStore.postsByTag(t._id, {});

        let filter1 = true;
        if (queryOptions && queryOptions.filterOptions && queryOptions.filterOptions.topLevelOnly) {
            filter1 = !t.tags.some((t) => t.tagType == tagType);
        }

        let filter2 = true;
        if (
            !queryOptions ||
            !queryOptions.filterOptions ||
            !queryOptions.filterOptions.includeEmpty
        ) {
            filter2 = posts != undefined && posts.length > 0;
        }

        let filter3 = true;
        if (pinned == "pinned") {
            filter3 = t.pinned;
        } else if (pinned == "unpinned") {
            filter3 = !t.pinned;
        }

        return t.tagType == tagType && filter1 && filter2 && filter3;
    });

    // sorting
    if (res && queryOptions && queryOptions.sortOptions) {
        if (queryOptions.sortOptions.sortBy == "title") {
            res = res.sort((a, b) => a.content[0].title.localeCompare(b.content[0].title));
        }

        if (queryOptions.sortOptions.sortBy == "publishDate") {
            res = res.sort((a, b) => {
                const newestPostA = postStore.postsByTag(a._id, {
                    sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
                    filterOptions: { top: 1 },
                });
                const newestPostB = postStore.postsByTag(b._id, {
                    sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
                    filterOptions: { top: 1 },
                });
                if (
                    !newestPostA ||
                    !newestPostB ||
                    !newestPostA[0] ||
                    !newestPostB[0] ||
                    !newestPostA[0].content[0] ||
                    !newestPostB[0].content[0] ||
                    !newestPostA[0].content[0].publishDate ||
                    !newestPostB[0].content[0].publishDate
                )
                    return 0;
                if (newestPostA[0].content[0].publishDate < newestPostB[0].content[0].publishDate)
                    return -1;
                if (newestPostA[0].content[0].publishDate > newestPostB[0].content[0].publishDate)
                    return 1;
                return 0;
            });
        }

        if (queryOptions.sortOptions.sortOrder == "desc") res = res.reverse();
    }

    return res || [];
}
