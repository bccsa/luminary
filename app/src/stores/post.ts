import { defineStore } from "pinia";
import { ContentStatus, type Post, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

export type postSortOptions = {
    sortBy?: "publishDate" | "title";
    sortOrder?: "asc" | "desc";
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
        return (tagId: Uuid, options: postSortOptions | undefined) => {
            const res = posts.value?.filter((p) => p.tags.some((t) => t._id == tagId));
            if (options && options.sortBy) {
                if (options.sortBy == "publishDate") {
                    const sorted = res?.sort((a, b) => {
                        if (!a.content[0].publishDate || !b.content[0].publishDate) return 0;
                        if (a.content[0].publishDate < b.content[0].publishDate) return -1;
                        if (a.content[0].publishDate > b.content[0].publishDate) return 1;
                        return 0;
                    });
                    if (options.sortOrder == "desc") return sorted?.reverse();
                    return sorted;
                }

                if (options.sortBy == "title") {
                    const sorted = res?.sort((a, b) =>
                        a.content[0].title.localeCompare(b.content[0].title),
                    );
                    if (options.sortOrder == "desc") return sorted?.reverse();
                    return sorted;
                }
            }

            return res;
        };
    });

    return { post, posts, postsByTag };
});
