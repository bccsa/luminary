<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import {
    type ContentDto,
    DocType,
    db,
    PostType,
    TagType,
    type Uuid,
    mangoToDexie,
    useDexieLiveQueryWithDeps,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";

const { t } = useI18n();

type Mode = "watching" | "reading";

const props = defineProps<{
    mode: Mode;
}>();

// --- Reactive reference to progress based on mode
const progressRef = ref<{ contentId: Uuid; mediaId?: string }[]>([]);

// Load progress data from localStorage
function loadProgress(): { contentId: Uuid; mediaId?: string }[] {
    try {
        const key = props.mode === "watching" ? "mediaProgress" : "readingProgress";
        const data = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

// Sync progressRef on mount and with localStorage changes
function startWatchingLocalStorage() {
    const update = () => {
        progressRef.value = loadProgress();
    };

    window.addEventListener("storage", update);
    const interval = setInterval(update, 5000);

    onUnmounted(() => {
        window.removeEventListener("storage", update);
        clearInterval(interval);
    });
}

onMounted(() => {
    progressRef.value = loadProgress();
    startWatchingLocalStorage();
});

// --- Reactive query to fetch content documents
const progressContent = useDexieLiveQueryWithDeps(
    () => [appLanguageIdsAsRef.value, progressRef.value],
    async ([appLanguageIds, progress]) => {
        if (progress.length === 0) return [];

        const contentIds = progress.map((entry: { contentId: Uuid }) => entry.contentId);

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

        const orderMap = new Map<string, number>(contentIds.map((id, i) => [id, i]));
        results.sort((a, b) => (orderMap.get(a._id) ?? 0) - (orderMap.get(b._id) ?? 0));

        return results;
    },
    {
        initialValue: [],
        deep: true,
    },
);
</script>

<template>
    <HorizontalContentTileCollection
        v-if="progressContent.length > 0"
        :contentDocs="progressContent"
        :title="mode === 'watching' ? t('home.continue.watch') : t('home.continue.read')"
        :showPublishDate="true"
        class="pt-4 pb-1"
    />
</template>
