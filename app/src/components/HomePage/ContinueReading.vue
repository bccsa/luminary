<script setup lang="ts">
// Import required components and modules
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { type ContentDto, DocType, db, PostType, TagType, type Uuid } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { isPublished } from "@/util/isPublished";
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";

const { t } = useI18n();

// Reactive reference to media progress stored in localStorage
const mediaProgressRef = ref(getReadedContentIds());

/**
 * Load the list of watched media from localStorage.
 * Each entry contains a mediaId and its corresponding contentId.
 */
function getReadedContentIds(): { contentId: Uuid }[] {
    try {
        const progressList = JSON.parse(localStorage.getItem("readingProgress") || "[]");
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
        mediaProgressRef.value = getReadedContentIds();
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
        deep: true, // react to nested changes in dependencies
    },
);
</script>

<template>
    <HorizontalContentTileCollection
        v-if="watchedContent.length > 0"
        :contentDocs="watchedContent"
        :title="t('home.continue.read')"
        :showPublishDate="true"
        :showProgress="true"
        class="pb-1 pt-4"
    />
</template>
