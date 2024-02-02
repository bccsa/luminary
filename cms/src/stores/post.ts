import { defineStore } from "pinia";
import type { Post, Content, PostDto } from "@/types";
import { db } from "@/db";

export const usePostStore = defineStore("post", {
    state: () => ({
        posts: [] as Post[],
    }),

    actions: {
        async savePosts(data: PostDto[]) {
            await db.posts.bulkPut(data);

            return this.updatePosts(data);
        },

        async updatePosts(data?: PostDto[]) {
            if (!data) {
                data = await db.posts.toArray();
            }

            const content = await db.content.toArray();

            this.posts = data.map((dto) => {
                const post = dto as unknown as Post;

                if (dto.content) {
                    post.content = dto.content.map(
                        (contentId) =>
                            content.find((c) => c._id == contentId) as unknown as Content,
                    );

                    post.defaultTitle = post.content[0].title;
                }

                return post;
            });
        },
    },
});
