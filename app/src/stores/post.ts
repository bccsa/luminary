import { defineStore } from "pinia";
import { ContentStatus, type Post, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

/**
 * Post sort options.
 */
type postSortOptions = {
    sortBy?: "publishDate" | "title";
    sortOrder?: "asc" | "desc";
};

/**
 * Post filter options.
 * If both "top" and "bottom" are selected, the bottom [bottom] number of posts are selected from the returned [top] number of posts.
 * @property top - Return the first [top] posts.
 * @property bottom - Return the last [bottom] posts.
 */
type postFilterOptions = {
    top?: number;
    bottom?: number;
};

/**
 * Post query filter and sort options.
 */
export type postQueryOptions = {
    filterOptions?: postFilterOptions;
    sortOptions?: postSortOptions;
};

export const usePostStore = defineStore("post", () => {
    const postRepository = new PostRepository();

    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => {
            const posts = await postRepository.getAll();
            return new Promise((resolve) => {
                resolve(
                    posts.filter((post) => {
                        return post.content[0]?.status == ContentStatus.Published;
                    }),
                );
            });
        }) as unknown as Observable<Post[]>,
    );

    const post = computed(() => {
        return (slug: string) => {
            return posts.value?.find((p) => p.content[0].slug == slug);
        };
    });

    /**
     * Get all posts by tag with optional sorting.
     */
    const postsByTag = computed(() => {
        return (tagId: Uuid, queryOptions?: postQueryOptions) => {
            // query
            let res = posts.value?.filter((p) => {
                return p.tags.some((t) => t._id == tagId);
            });

            // optional sorting
            if (
                res &&
                queryOptions &&
                queryOptions.sortOptions &&
                queryOptions.sortOptions.sortBy
            ) {
                if (queryOptions.sortOptions.sortBy == "publishDate") {
                    res = res?.sort((a, b) => {
                        if (!a.content[0].publishDate || !b.content[0].publishDate) return 0;
                        if (a.content[0].publishDate < b.content[0].publishDate) return -1;
                        if (a.content[0].publishDate > b.content[0].publishDate) return 1;
                        return 0;
                    });
                }

                if (queryOptions.sortOptions.sortBy == "title") {
                    res = res?.sort((a, b) => a.content[0].title.localeCompare(b.content[0].title));
                }

                if (queryOptions.sortOptions.sortOrder == "desc") res = res?.reverse();
            }

            // Optional top filter
            if (
                res &&
                queryOptions &&
                queryOptions.filterOptions &&
                queryOptions.filterOptions.top
            ) {
                res = res?.slice(0, queryOptions.filterOptions.top);
            }

            // Optional bottom filter
            if (
                res &&
                queryOptions &&
                queryOptions.filterOptions &&
                queryOptions.filterOptions.bottom
            ) {
                res = res?.slice(-queryOptions.filterOptions.bottom);
            }

            return res;
        };
    });

    return { post, posts, postsByTag };
});
