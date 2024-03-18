import { defineStore } from "pinia";
import { type Post } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

export const usePostStore = defineStore("post", () => {
    const postRepository = new PostRepository();

    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => postRepository.getAll()) as unknown as Observable<Post[]>,
    );

    const post = computed(() => {
        return (slug: string) => {
            return posts.value?.find((p) => p.content[0].slug == slug);
        };
    });

    return { post, posts };
});
