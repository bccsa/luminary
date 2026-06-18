<script lang="ts" setup>
import ContentTile from "@/components/content/ContentTile.vue";
import { userPreferencesAsRef } from "@/globalConfig";
import { type ContentDto } from "luminary-shared";
import { computed, nextTick, onMounted } from "vue";
import { BookmarkIcon } from "@heroicons/vue/24/outline";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";
import BasePage from "@/components/BasePage.vue";
import { markPageReady } from "@/util/renderState";

const { t } = useI18n();

onMounted(async () => {
    await nextTick();
    markPageReady();
});

// Get bookmarked documents
const bookmarks = computed(
    () => userPreferencesAsRef.value.bookmarks?.sort((a, b) => b.ts - a.ts).map((b) => b.id) ?? [],
);

const content = useContentQuery(() => [{ parentId: { $in: bookmarks.value } }], {
    includeScheduled: false,
});

const sorted = computed(
    () =>
        bookmarks.value
            .map((b) => content.value.find((c) => c.parentId === b))
            .filter((c) => c !== undefined) as ContentDto[],
);
</script>

<template>
    <BasePage>
        <div class="px-2">
            <h1 class="mb-4 text-xl font-medium text-zinc-700 dark:text-slate-100">
                {{ t("bookmarks.title") }}
            </h1>
            <div class="flex flex-wrap gap-4">
                <ContentTile
                    v-for="content in sorted"
                    :key="content._id"
                    :content="content"
                    class="flex w-auto justify-start"
                />
            </div>
            <div v-if="!content.length" class="text-zinc-500 dark:text-slate-200">
                {{ t("bookmarks.empty_page") }} "<BookmarkIcon class="inline h-5 w-5" />"
            </div>
        </div>
    </BasePage>

</template>
