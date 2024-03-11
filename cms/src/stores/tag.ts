import { defineStore } from "pinia";
import { TagType, type Tag } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { TagRepository } from "@/db/repositories/tagRepository";

export const useTagStore = defineStore("tag", () => {
    const tagRepository = new TagRepository();

    const tags: Readonly<Ref<Tag[] | undefined>> = useObservable(
        liveQuery(async () => tagRepository.getAll()) as unknown as Observable<Tag[]>,
    );

    const categories = computed(() => {
        if (!tags.value) {
            return [];
        }

        return tags.value?.filter((tag) => tag.tagType == TagType.Category);
    });

    const topics = computed(() => {
        if (!tags.value) {
            return [];
        }

        return tags.value?.filter((tag) => tag.tagType == TagType.Topic);
    });

    const audioPlaylists = computed(() => {
        if (!tags.value) {
            return [];
        }

        return tags.value?.filter((tag) => tag.tagType == TagType.AudioPlaylist);
    });

    return { tags, categories, topics, audioPlaylists };
});
