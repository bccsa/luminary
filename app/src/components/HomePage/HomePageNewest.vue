<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { watch } from "vue";
import {
    type ContentDto,
    DocType,
    PostType,
    TagType,
    type Uuid,
    db,
    useDexieLiveQueryWithDeps,
    mangoToDexie,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const newest10Content = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) => {
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { type: DocType.Content },
                    { $or: [{ parentPostType: { $exists: false } }, { parentPostType: { $ne: PostType.Page } }] },
                    { $or: [{ parentTagType: { $exists: false } }, { parentTagType: { $ne: TagType.Category } }] },
                    { parentPublishDateVisible: true },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
            $sort: [{ publishDate: "desc" }],
            $limit: 10,
        });
    },
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
    <HorizontalContentTileCollection :contentDocs="newest10Content" :title="t('home.newest')" :showPublishDate="true"
        class="pb-1 pt-4" />
</template>
