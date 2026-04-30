<script setup lang="ts">
// Import required components and modules
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { type ContentDto, DocType, db, PostType, TagType, type Uuid, mangoToDexie, useDexieLiveQueryWithDeps } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";

const { t } = useI18n();

// Reactive reference to media progress stored in localStorage
const mediaProgressRef = ref(getWatchedMediaIds());

/**
 * Load the list of watched media from localStorage.
 * Each entry contains a mediaId and its corresponding contentId.
 */
function getWatchedMediaIds(): { mediaId: string; contentId: Uuid }[] {
    try {
        const progressList = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        return Array.isArray(progressList) ? progressList : [];
    } catch {
        return [];
    }
}

/**
 * Start watching for changes to localStorage (to sync between tabs).
 * Also sets a fallback interval to update regularly (useful for same-tab updates).
 */
function startWatchingLocalStorage() {
    const update = () => {
        mediaProgressRef.value = getWatchedMediaIds();
    };

    // Listen for cross-tab updates
    window.addEventListener("storage", update);

    // Fallback: update every 5 seconds in case the event doesn't fire
    const interval = setInterval(update, 5000);

    // Cleanup on component unmount
    onUnmounted(() => {
        window.removeEventListener("storage", update);
        clearInterval(interval);
    });
}

// Start watching on mount
onMounted(startWatchingLocalStorage);

/**
 * Fetch the content documents based on watched media IDs.
 */
const watchedContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value, mediaProgressRef.value],
    async ([appLanguageIds, watched]) => {
        if (watched.length === 0) return [];

        const contentIds = watched.map((entry: any) => entry.contentId);

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

        // Re-sort results to match the watched order from localStorage
        const orderMap = new Map<string, number>(contentIds.map((id: string, i: number) => [id, i]));
        results.sort((a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0));

        // Only show video content (has a direct video field or an HLS stream)
        return results.filter((c) => c.video || c.parentMedia?.hlsUrl);
    },
    {
        initialValue: [],
        deep: true, // react to nested changes in dependencies
    },
);
</script>

<template>
    <HorizontalContentTileCollection
        v-if="watchedContent.length > 0"
        :contentDocs="watchedContent"
        :title="t('home.continue')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
