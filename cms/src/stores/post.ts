import { defineStore } from "pinia";
import type { Post, PostDto } from "@/types";
import { liveQuery } from "dexie";
import { db, dbReady } from "@/db";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import { fromDtos } from "@/types/mappers/postMapper";

export const usePostStore = defineStore("post", () => {
    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => {
            return await db.posts.toArray((dtos) => Promise.all(fromDtos(dtos)));
        }) as any,
    );

    const initialized = computed(() => dbReady.value && posts.value !== undefined);

    function savePosts(data: PostDto[]) {
        return db.posts.bulkPut(data);
    }

    return { posts, savePosts, initialized };
});
