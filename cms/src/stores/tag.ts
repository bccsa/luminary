import { defineStore } from "pinia";
import { type Tag } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";
import type { Observable } from "rxjs";
import { TagRepository } from "@/db/repositories/tagRepository";

export const useTagStore = defineStore("tag", () => {
    const tagRepository = new TagRepository();

    const tags: Readonly<Ref<Tag[] | undefined>> = useObservable(
        liveQuery(async () => tagRepository.getAll()) as unknown as Observable<Tag[]>,
    );

    return { tags };
});
