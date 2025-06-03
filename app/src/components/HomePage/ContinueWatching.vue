<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { type ContentDto, DocType, db, PostType, TagType, type Uuid } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { isPublished } from "@/util/isPublished";
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";

const { t } = useI18n();

// Make mediaProgress reactive
const mediaProgressRef = ref(getWatchedMediaIds());

function getWatchedMediaIds(): { mediaId: string; contentId: Uuid }[] {
    try {
        const progressList = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        return Array.isArray(progressList) ? progressList : [];
    } catch {
        return [];
    }
}

// Watch localStorage for changes (for multi-tab support)
function startWatchingLocalStorage() {
    const update = () => {
        mediaProgressRef.value = getWatchedMediaIds();
    };

    // Initial load
    window.addEventListener("storage", update);

    // Fallback polling every 5s (optional but helps with internal tab)
    const interval = setInterval(update, 5000);

    onUnmounted(() => {
        window.removeEventListener("storage", update);
        clearInterval(interval);
    });
}

onMounted(startWatchingLocalStorage);

const watchedContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value, mediaProgressRef.value],
    async ([appLanguageIds, watched]) => {
        if (watched.length === 0) return [];

        const contentIds = watched.map((entry: any) => entry.contentId);
        const allDocs = await db.docs.bulkGet(contentIds);

        const validContent = allDocs.filter((c) => {
            const doc = c as ContentDto;
            if (!doc || doc.type !== DocType.Content) return false;
            if (doc.parentPostType === PostType.Page) return false;
            if (doc.parentTagType === TagType.Category) return false;

            return isPublished(doc, appLanguageIds);
        });

        return validContent as ContentDto[];
    },
    {
        initialValue: [],
        deep: true,
    },
);
</script>

<template>
    <HorizontalContentTileCollection
        v-if="watchedContent.length > 0"
        :contentDocs="watchedContent"
        :title="t('home.continueWatching')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
