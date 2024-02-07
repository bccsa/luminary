import { defineStore } from "pinia";
import { DocType, type Post, type PostDto } from "@/types";
import { liveQuery } from "dexie";
import { db } from "@/db";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";
import { fromDtos } from "@/types/mappers/postMapper";

export const usePostStore = defineStore("post", () => {
    const posts: Readonly<Ref<Post[] | undefined>> = useObservable(
        liveQuery(async () => {
            return await db.docs
                .where("type")
                .equals(DocType.Post)
                .toArray((dtos) => Promise.all(fromDtos(dtos as PostDto[])));
        }) as any,
    );

    return { posts };
});
