<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    type ContentDto,
    DocType,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import IgnorePagePadding from "../IgnorePagePadding.vue";
import { contentByTag } from "../contentByTag";
import { useInfiniteScroll } from "@vueuse/core";
import { isPublished } from "@/util/isPublished";

const pinnedTopics = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
                parentPinned: 1, // 1 = true
                parentTagType: TagType.Category,
            })
            .filter((c) => {
                const content = c as ContentDto;

                return isPublished(content);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("explore_pinnedTopics") },
);

watch(pinnedTopics, async (value) => {
    db.setQueryCache<ContentDto[]>("explore_pinnedTopics", value);
});

const pinnedTopicContent = useDexieLiveQueryWithDeps(
    [appLanguageIdAsRef, pinnedTopics],
    ([appLanguageId, pinnedTopics]: [Uuid, ContentDto[]]) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;

                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

                for (const tagId of content.parentTags) {
                    if (pinnedTopics.some((p) => p.parentId == tagId)) return true;
                }
                return isPublished(content);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("explorepage_pinnedTopics") },
);

watch(pinnedTopicContent, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_pinnedTopics", value);
});

// sort pinned content by category
const pinnedContentByTopic = contentByTag(pinnedTopicContent, pinnedTopics);

const scrollContent = ref<HTMLElement | null>(null);

const scrollPosition = ref(10);
const infiniteScrollData = computed(() =>
    pinnedContentByTopic.value.slice(0, scrollPosition.value),
);

useInfiniteScroll(
    scrollContent,
    () => {
        scrollPosition.value += 10;
    },
    { distance: 10 },
);
</script>

<template>
    <div class="-my-6">
        <IgnorePagePadding>
            <div v-for="c in infiniteScrollData" :key="c.tag._id" ref="scrollContent">
                <HorizontalContentTileCollection
                    v-if="c.content.length > 0"
                    :contentDocs="c.content"
                    :title="c.tag.title"
                    aspectRatio="classic"
                    :summary="c.tag.summary"
                    :showPublishDate="false"
                    class="pb-3 pt-4"
                />
            </div>
        </IgnorePagePadding>
    </div>
</template>
