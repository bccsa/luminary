import { defineStore } from "pinia";
import { type Content, type CreatePostDto, type Post, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";

export const usePostStore = defineStore("post", () => {
    const postRepository = new PostRepository();

    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => postRepository.findAll()) as unknown as Observable<Post[]>,
    );

    const post = computed(() => {
        return (postId: Uuid) => {
            return posts.value?.find((p) => p._id == postId);
        };
    });

    const createPost = async (post: CreatePostDto) => {
        return postRepository.create(post);
    };

    const updatePost = async (content: Content, post: Post) => {
        debugger;

        return postRepository.update(content, post);
    };

    return { post, posts, createPost, updatePost };
});
