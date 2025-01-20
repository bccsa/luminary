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
import { appLanguageIdsAsRef } from "@/globalConfig";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import IgnorePagePadding from "../IgnorePagePadding.vue";
import { contentByTag } from "../contentByTag";
import { isPublished } from "@/util/isPublished";

const pinnedTopics = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                parentPinned: 1, // 1 = true
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (content.parentTagType && content.parentTagType !== TagType.Category)
                    return false;

                return isPublished(content, appLanguageIds);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("explore_pinnedTopics") },
);

watch(pinnedTopics, async (value) => {
    db.setQueryCache<ContentDto[]>("explore_pinnedTopics", value);
});

const pinnedTopicContent = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, pinnedTopics],
    ([appLanguageIds, pinnedTopics]: [Uuid[], ContentDto[]]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!isPublished(content, appLanguageIds)) return false;

                if (content.parentType != DocType.Tag) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;

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
            <HorizontalContentTileCollection
                v-for="c in pinnedContentByTopic"
                :key="c.tag._id"
                :contentDocs="c.content"
                :title="c.tag.title"
                aspectRatio="classic"
                :summary="c.tag.summary"
                :showPublishDate="false"
                class="pb-3 pt-4"
            />
        </IgnorePagePadding>
    </div>
</template>
