import { defineStore } from "pinia";
import { type Content, type CreatePostDto, type Language, type Post, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { PostRepository } from "@/db/repositories/postRepository";
import type { Observable } from "rxjs";
import { ContentRepository } from "@/db/repositories/contentRepository";

export const usePostStore = defineStore("post", () => {
    const postRepository = new PostRepository();
    const contentRepository = new ContentRepository();

    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => postRepository.getAll()) as unknown as Observable<Post[]>,
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
        return postRepository.update(content, post);
    };

    const createTranslation = async (post: Post, language: Language) => {
        return contentRepository.create({
            parentId: post._id,
            language: language._id,
            title: language.name,
        });
    };

    return { post, posts, createPost, updatePost, createTranslation };
});
