import { defineStore } from "pinia";
import { ContentStatus, type Post, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

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

    const postsByTag = computed(() => {
        return (tagId: Uuid) => {
            return posts.value?.filter((p) => p.tags.some((t) => t._id == tagId));
        };
    });

    return { post, posts, postsByTag };
});
