import { defineStore } from "pinia";
import { ContentStatus, TagType, type Tag } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { TagRepository } from "@/db/repositories/tagRepository";
import { usePostStore } from "./post";

export const useTagStore = defineStore("category", () => {
    const tagRepository = new TagRepository();
    const postStore = usePostStore();

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

    /**
     * Get tags by tag type. Only return tags that have posts.
     * TODO: Change to return tags which are used in posts and/or other tags
     */
    const tagsByTagType = computed(() => {
        return (tagType: TagType) => {
            if (postStore) {
                return tags.value?.filter((t) => {
                    const posts = postStore.postsByTag(t._id);
                    return t.tagType == tagType && posts && posts.length > 0;
                });
            }
            return [];
        };
    });

    return { tag, tags, tagsByTagType };
});
