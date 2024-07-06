import { defineStore } from "pinia";
import { type Content, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { ContentRepository } from "@/db/repositories/contentRepository";

export const useContentStore = defineStore("content", () => {
    const contentRepository = new ContentRepository();

    const allContent: Readonly<Ref<Content[] | undefined>> = useObservable(
        liveQuery(async () => contentRepository.getAll()) as unknown as Observable<Content[]>,
    );

    const singleContent = computed(() => {
        return (parentId: Uuid, languageCode: string) => {
            return allContent.value?.find(
                (p) => p.parentId == parentId && p.language.languageCode == languageCode,
            );
        };
    });

    return { allContent, singleContent };
});
