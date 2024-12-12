<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { isPublished } from "@/util/isPublished";
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
    appLanguageIdsAsRef,
    (languageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                parentTagType: TagType.Topic,
                status: "published",
            })
            .filter((c) => {
                const content = c as ContentDto;
                // console.info(content);
                console.info(content.availableTranslations);
                const firstSupportedLang = languageIds.find((lang: Uuid) =>
                    content.availableTranslations?.includes(lang),
                );

                if (content.language !== firstSupportedLang) return false;
                return isPublished(c as ContentDto);
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
