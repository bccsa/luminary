import { defineStore } from "pinia";
import { type CreatePostDto, type Post } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

export const usePostStore = defineStore("post", () => {
    const postRepository = new PostRepository();

    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => postRepository.findAll()) as unknown as Observable<Post[]>,
    );

    const createPost = async (post: CreatePostDto) => {
        return postRepository.create(post);
    };

    return { posts, createPost };
});
