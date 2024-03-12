import { defineStore } from "pinia";
import { TagType, type Tag, type Content, type Uuid, type Language } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { TagRepository } from "@/db/repositories/tagRepository";
import { ContentRepository } from "@/db/repositories/contentRepository";

export const useTagStore = defineStore("tag", () => {
    const tagRepository = new TagRepository();
    const contentRepository = new ContentRepository();

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

    const tag = computed(() => {
        return (tagId: Uuid) => {
            return tags.value?.find((t) => t._id == tagId);
        };
    });

    const updateTag = async (content: Content, tag: Tag) => {
        return tagRepository.update(content, tag);
    };

    const createTranslation = async (tag: Tag, language: Language) => {
        return contentRepository.create({
            parentId: tag._id,
            language: language._id,
            title: language.name,
        });
    };

    return { tags, tag, updateTag, createTranslation, categories, topics, audioPlaylists };
});
