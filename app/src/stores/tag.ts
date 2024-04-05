import { defineStore } from "pinia";
import { ContentStatus, TagType, type Tag } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { TagRepository } from "@/db/repositories/tagRepository";

export const useTagStore = defineStore("category", () => {
    const tagRepository = new TagRepository();

    const tags: Readonly<Ref<Tag[] | undefined>> = useObservable(
        liveQuery(async () => {
            const posts = await tagRepository.getAll();
            return new Promise((resolve) => {
                resolve(
                    posts.filter((tag) => {
                        return tag.content[0]?.status == ContentStatus.Published;
                    }),
                );
            });
        }) as unknown as Observable<Tag[]>,
    );

    const tag = computed(() => {
        return (slug: string) => {
            return tags.value?.find((p) => p.content[0].slug == slug);
        };
    });

    const tagsByTagType = computed(() => {
        return (tagType: TagType) => {
            return tags.value?.filter((t) => t.tagType == tagType);
        };
    });

    return { tag, tags, tagsByTagType };
});
