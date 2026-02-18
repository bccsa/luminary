<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { type ContentDto, DocType, db, PostType, TagType, type Uuid, mangoToDexie, useDexieLiveQueryWithDeps } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";

const { t } = useI18n();

const mediaProgressRef = ref(getListenedMediaIds());

function getListenedMediaIds(): { mediaId: string; contentId: Uuid }[] {
    try {
        const progressList = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        return Array.isArray(progressList) ? progressList : [];
    } catch {
        return [];
    }
}

function startWatchingLocalStorage() {
    const update = () => {
        mediaProgressRef.value = getListenedMediaIds();
    };

    window.addEventListener("storage", update);

    const interval = setInterval(update, 5000);

    onUnmounted(() => {
        window.removeEventListener("storage", update);
        clearInterval(interval);
    });
}

onMounted(startWatchingLocalStorage);

const listenedContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value, mediaProgressRef.value],
    async ([appLanguageIds, listened]) => {
        if (listened.length === 0) return [];

        const contentIds = listened.map((entry: any) => entry.contentId);

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

        // Only show audio content (has file collections but no video or HLS stream)
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
