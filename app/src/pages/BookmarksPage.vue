<script lang="ts" setup>
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdAsRef, userPreferences } from "@/globalConfig";
import { db, type ContentDto } from "luminary-shared";
import { ref, watch, onMounted, computed } from "vue";

// Extract bookmark keys
const bookmarkKeys = computed(() => Object.keys(userPreferences.value.bookmarks));

// Reactive variable to hold bookmarked content
const bookmarkContent = ref<ContentDto[]>([]);

// Function to fetch content based on language and bookmark keys
const fetchBookmarkContent = async () => {
    try {
        if (bookmarkKeys.value.length > 0) {
            bookmarkContent.value = await db.whereParent(
                bookmarkKeys.value,
                undefined,
                appLanguageIdAsRef.value,
            );
        } else {
            bookmarkContent.value = [];
        }
    } catch (error) {
        console.error("Error fetching bookmarked content:", error);
    }
};

// Fetch content initially on mount
onMounted(fetchBookmarkContent);

// Watch language and fetch new content when it changes
watch([appLanguageIdAsRef, bookmarkKeys], fetchBookmarkContent);
</script>

<template>
    <div>
        <h1 class="mb-4 text-xl font-medium">Bookmarks</h1>
        <div class="flex flex-wrap gap-4">
            <ContentTile
                v-for="content in bookmarkContent"
                :key="content._id"
                :content="content"
                class="flex w-auto justify-start"
            />
        </div>
        <div v-if="bookmarkContent.length === 0" class="text-gray-500">
            No bookmarks available for the selected language.
        </div>
    </div>
</template>
