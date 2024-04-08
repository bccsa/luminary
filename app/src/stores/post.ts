import { defineStore } from "pinia";
import { ContentStatus, type Post, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

export type postSortOptions = {
    sortField?: string;
    sortType?: "string" | "number";
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
     * Get all posts by tag.
     * options: The sortField has to be set in order to user the sortOrder. The default sortOrder is "asc". The default sortType is "string"
     * The sortField is a Content document field.
     */
    const postsByTag = computed(() => {
        return (tagId: Uuid, options: postSortOptions | undefined) => {
            const res = posts.value?.filter((p) => p.tags.some((t) => t._id == tagId));
            if (options && options.sortField) {
                if (!options.sortType) options.sortType = "string";

                if (options.sortType == "string") {
                    const sorted = res?.sort((a, b) =>
                        a.content[0][options.sortField].localeCompare(
                            b.content[0][options.sortField],
                        ),
                    );
                    if (options.sortOrder == "desc") return sorted?.reverse();
                    return sorted;
                }

                if (options.sortType == "number") {
                    return res?.sort((a, b) => {
                        if (options.sortOrder == "desc") {
                            return (
                                b.content[0][options.sortField] - a.content[0][options.sortField]
                            );
                        }
                        return a.content[0][options.sortField] - b.content[0][options.sortField];
                    });
                }
            }

            return res;
        };
    });

    return { post, posts, postsByTag };
});
