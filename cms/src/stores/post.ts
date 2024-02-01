import { defineStore } from "pinia";
import { DocType, type Post, type Content, type BaseDocument } from "@/types/cms";

export const usePostStore = defineStore("post", {
    state: () => ({
        posts: [] as Post[],
    }),

    actions: {
        savePosts(data: BaseDocument[]) {
            this.posts = data
                .filter((doc) => doc.type == DocType.Post)
                .map((post: Post) => {
                    if (post.content) {
                        post.content = post.content.map((contentId: string) => {
                            return data.find((doc) => doc._id == contentId) as Content;
                        });
                        post.title = post.content[0].title;
                    }
                    return post;
                }) as Post[];
        },
    },
});
