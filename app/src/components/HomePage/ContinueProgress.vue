<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { type ContentDto, DocType, db, PostType, TagType, type Uuid } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { isPublished } from "@/util/isPublished";
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

        const contentIds = progress.map((entry: any) => entry.contentId);
        const allDocs = await db.docs.bulkGet(contentIds);

        return allDocs.filter((c) => {
            const doc = c as ContentDto;
            if (!doc || doc.type !== DocType.Content) return false;
            if (doc.parentPostType === PostType.Page) return false;
            if (doc.parentTagType === TagType.Category) return false;

            return isPublished(doc, appLanguageIds);
        }) as ContentDto[];
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
        :showProgress="mode === 'reading'"
        class="pt-4 pb-1"
    />
</template>
