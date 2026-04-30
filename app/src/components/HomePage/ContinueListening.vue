<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { type ContentDto, DocType, db, PostType, TagType, mangoToDexie, useDexieLiveQueryWithDeps } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// TODO: Replace with central watch/listen/read service when implemented (separate ticket)
const listenedContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value],
    async ([appLanguageIds]) => {
        const contentIds: string[] = [];
        if (contentIds.length === 0) return [];

        const results = await mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { _id: { $in: contentIds } },
                    { type: DocType.Content },
                    { parentPostType: { $ne: PostType.Page } },
                    { parentTagType: { $ne: TagType.Category } },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });

        const orderMap = new Map<string, number>(contentIds.map((id: string, i: number) => [id, i]));
        results.sort((a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0));

        return results.filter(
            (c) =>
                c.parentMedia?.fileCollections?.length &&
                !c.video &&
                !c.parentMedia?.hlsUrl,
        );
    },
    {
        initialValue: [],
        deep: true,
    },
);
</script>

<template>
    <HorizontalContentTileCollection
        v-if="listenedContent.length > 0"
        :contentDocs="listenedContent"
        :title="t('home.continueListening')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
