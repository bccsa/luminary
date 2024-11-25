<script setup lang="ts">
import { watch } from "vue";
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
// import VerticalTagViewer from "../tags/VerticalTagViewer.vue";

const pinnedTopics = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
                parentPinned: 1, // 1 = true
                parentTagType: TagType.Topic,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
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
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;

                for (const tagId of content.parentTags) {
                    if (pinnedTopics.some((p) => p.parentId == tagId)) return true;
                }
                return false;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("explorepage_pinnedTopics") },
);

watch(pinnedTopicContent, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_pinnedTopics", value);
});

// sort pinned content by category
const pinnedContentByTopic = contentByTag(pinnedTopicContent, pinnedTopics);
</script>

<template>
    <div class="-my-6">
        <IgnorePagePadding>
            <template v-for="c in pinnedContentByTopic" :key="c.tag._id">
                <!-- Check if the filtered content has any items -->
                <HorizontalContentTileCollection
                    v-if="c.content.length > 0"
                    :contentDocs="c.content"
                    :title="c.tag.title"
                    aspectRatio="classic"
                    :summary="c.tag.summary"
                    :showPublishDate="false"
                    class="pb-3 pt-4"
                />
            </template>
        </IgnorePagePadding>
    </div>
</template>
