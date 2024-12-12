<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { watch } from "vue";
import { type ContentDto, DocType, PostType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { isPublished } from "@/util/isPublished";

const newest10Content = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .orderBy("publishDate")
            .reverse()
            .filter((c) => {
                const content = c as ContentDto;
                if (content.type !== DocType.Content) return false;
                if (content.language !== appLanguageId) return false;
                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType == TagType.Category)
                    return false;

                return isPublished(content);
            })
            .limit(10) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("homepage_newestContent"),
    },
);

watch(newest10Content, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_newestContent", value);
});
</script>

<template>
    <HorizontalContentTileCollection
        :contentDocs="newest10Content"
        title="Newest"
        :showPublishDate="true"
    />
</template>
