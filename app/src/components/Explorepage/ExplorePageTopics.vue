<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import {
    db,
    DocType,
    TagType,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { watch } from "vue";

const topics = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (languageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                parentTagType: TagType.Topic,
                language: languageId,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;

                // Only include published content
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .sortBy("title") as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_topics"),
    },
);

watch(topics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_topics", value);
});
</script>

<template>
    <div class="flex flex-wrap gap-4">
        <ContentTile
            v-for="topic in topics"
            :key="topic._id"
            :content="topic"
            :showPublishDate="false"
        />
    </div>
</template>
