<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { watch } from "vue";
import { type ContentDto, DocType, PostType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { isPublished } from "@/util/isPublished";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const newest10Content = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .orderBy("publishDate")
            .reverse()
            .filter((c) => {
                const content = c as ContentDto;
                if (content.type !== DocType.Content) return false;
                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType == TagType.Category)
                    return false;
                if (!content.parentPublishDateVisible) return false;

                return isPublished(content, appLanguageIds);
            })
            .limit(10) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("homepage_newestContent"),
        deep: true,
    },
);

watch(newest10Content, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_newestContent", value);
});
</script>

<template>
    <HorizontalContentTileCollection
        :contentDocs="newest10Content"
        :title="t('home.newest')"
        :showPublishDate="true"
        class="pb-1 pt-4"
    />
</template>
