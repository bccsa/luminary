<script lang="ts" setup>
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdsAsRef, userPreferencesAsRef } from "@/globalConfig";
import { db, useDexieLiveQueryWithDeps, mangoToDexie, type ContentDto, type Uuid } from "luminary-shared";
import { computed } from "vue";
import { BookmarkIcon } from "@heroicons/vue/24/outline";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useI18n } from "vue-i18n";
import BasePage from "@/components/BasePage.vue";

const { t } = useI18n();

// Get bookmarked documents
const bookmarks = computed(
    () => userPreferencesAsRef.value.bookmarks?.sort((a, b) => b.ts - a.ts).map((b) => b.id) ?? [],
);

const content = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, bookmarks],
    ([appLanguageIds, bookmarkIds]: [Uuid[], Uuid[]]) => {
        if (bookmarkIds.length === 0) return Promise.resolve([] as ContentDto[]);
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { parentId: { $in: bookmarkIds } },
                    ...mangoIsPublished(appLanguageIds),
                ],
            },
        });
    },
    {
        initialValue: [],
    },
);

const sorted = computed(
    () =>
        bookmarks.value
            .map((b) => content.value.find((c) => c.parentId === b))
            .filter((c) => c !== undefined) as ContentDto[],
);
</script>

<template>
    <BasePage>
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
</BasePage>
        
</template>
