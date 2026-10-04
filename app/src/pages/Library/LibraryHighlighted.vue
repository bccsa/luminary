<script lang="ts" setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import ContentTile from "@/components/content/ContentTile.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";

const { t } = useI18n();

// A highlight belongs to one translation, so this panel shows that translation rather than
// the post: two languages of the same post are two separate entries here.
const highlighted = useUserActivity("highlighted");
const contentIds = computed(() => highlighted.value.map((row) => row.contentId as string));

const content = useContentQuery(() => [{ _id: { $in: contentIds.value } }], {
    includeScheduled: false,
    // The user read this translation to highlight it, so it belongs here whether or not its
    // language is still among the ones they display.
    languageFilter: false,
    keepPreviousResult: true,
});

const sorted = computed(
    () =>
        contentIds.value
            .map((id) => content.value.find((c) => c._id === id))
            .filter((c) => c !== undefined) as ContentDto[],
);
</script>

<template>
    <div data-test="library-highlighted">
        <div class="flex flex-wrap gap-4">
            <ContentTile
                v-for="item in sorted"
                :key="item._id"
                :content="item"
                class="flex w-auto justify-start"
            />
        </div>
        <div
            v-if="!sorted.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("library.highlighted.empty_page") }}
        </div>
    </div>
</template>
