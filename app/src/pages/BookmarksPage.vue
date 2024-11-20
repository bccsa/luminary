<script lang="ts" setup>
import ContentTile from "@/components/content/ContentTile.vue";
import { appLanguageIdAsRef, userPreferencesAsRef } from "@/globalConfig";
import {
    db,
    DocType,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { computed } from "vue";
import { BookmarkIcon } from "@heroicons/vue/24/solid";

// Extract bookmark keys
const bookmarkKeys = computed(() => Object.keys(userPreferencesAsRef.value.bookmarks || []));

const bookmarkContent = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where("parentId")
            .anyOf(bookmarkKeys.value)
            .filter((c) => {
                const content = c as ContentDto;
                if (content.language !== appLanguageId) return false;

                // Only include published content
                if (content.status !== "published") return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .toArray() as unknown as Promise<ContentDto[]>,

    {
        initialValue: [],
    },
);
</script>

<template>
    <div>
        <h1 class="mb-4 text-xl font-medium text-zinc-700 dark:text-slate-100">Bookmarks</h1>
        <div class="flex flex-wrap gap-4">
            <ContentTile
                v-for="content in bookmarkContent"
                :key="content._id"
                :content="content"
                class="flex w-auto justify-start"
            />
        </div>
        <div v-if="!bookmarkContent.length" class="text-zinc-500 dark:text-slate-200">
            You should try this! <br />Click "<BookmarkIcon class="inline h-5 w-5" />" on any post
        </div>
    </div>
</template>
