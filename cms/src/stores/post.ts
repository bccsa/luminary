import { defineStore } from "pinia";
import type { Post, Content, PostDto } from "@/types";
import { db } from "@/db";
import { ref, type Ref } from "vue";

export const usePostStore = defineStore("post", () => {
    const posts: Ref<Post[]> = ref([]);

    async function savePosts(data: PostDto[]) {
        await db.posts.bulkPut(data);

        return updatePosts(data);
    }

    async function updatePosts(data?: PostDto[]) {
        if (!data) {
            data = await db.posts.toArray();
        }

        const content = await db.content.toArray();

        posts.value = data.map((dto) => {
            const post = dto as unknown as Post;

            if (dto.content) {
                post.content = dto.content.map(
                    (contentId) => content.find((c) => c._id == contentId) as unknown as Content,
                );

                post.defaultTitle = post.content[0].title;
            }

            return post;
        });
    }

    return { posts, savePosts, updatePosts };
});
