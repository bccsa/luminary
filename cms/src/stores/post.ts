import { defineStore } from "pinia";
import type { Post, PostDto } from "@/types";
import { liveQuery } from "dexie";
import { db } from "@/db";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";
import { fromDtos } from "@/types/postMapper";

export const usePostStore = defineStore("post", () => {
    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => {
            return await db.posts.toArray((dtos) => Promise.all(fromDtos(dtos)));
        }) as any,
    );

    async function savePosts(data: PostDto[]) {
        return db.posts.bulkPut(data);
    }

    return { posts, savePosts };
});
