<script setup lang="ts">
// Import required components and modules
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { PostType, TagType, type Uuid } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";
import { computed, ref, onMounted, onUnmounted } from "vue";

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

// Watched content ids in localStorage order. Reading mediaProgressRef here keeps
// the query reactive to localStorage changes (auto-tracked through the thunk).
const contentIds = computed(() => mediaProgressRef.value.map((entry) => entry.contentId));

// Fetch the content documents for the watched media ids.
const content = useContentQuery(
    () => [
        { _id: { $in: contentIds.value } },
        {
            $or: [
                { parentPostType: { $exists: false } },
                { parentPostType: { $ne: PostType.Page } },
            ],
        },
        {
            $or: [
                { parentTagType: { $exists: false } },
                { parentTagType: { $ne: TagType.Category } },
            ],
        },
    ],
    // cacheId disambiguates from ContinueListening: both query the same shape
    // (`_id $in` + the same $or filters), so without it they would share one cache
    // entry and seed from each other on first paint.
    { cache: true, cacheId: "continue-watching" },
);

// Re-sort to match the watched order from localStorage, then keep only video
// content (a direct video field or an HLS stream).
const watchedContent = computed(() => {
    const orderMap = new Map(contentIds.value.map((id, i) => [id, i]));
    return [...content.value]
        .sort((a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0))
        .filter((c) => c.video || c.parentMedia?.hlsUrl);
});
</script>

<template>
    <HorizontalContentTileCollection
        v-if="watchedContent.length > 0"
        :contentDocs="watchedContent"
        :title="t('home.continue.watch')"
        :showPublishDate="true"
        class="pt-4 pb-1"
    />
</template>
