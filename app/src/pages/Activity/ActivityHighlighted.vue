<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightRange } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import ActivityHighlightPanel from "./ActivityHighlightPanel.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";
import { removeUserActivity } from "@/userActivity/store";

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

type Entry = { content: ContentDto; ranges: HighlightRange[] };

/** Each translation paired with the passages saved against it, in activity order. */
const entries = computed<Entry[]>(() =>
    highlighted.value
        .map((row) => ({
            content: content.value.find((c) => c._id === row.contentId),
            ranges: row.payload?.ranges ?? [],
        }))
        .filter((entry): entry is Entry => !!entry.content),
);

// One panel for the tab rather than one per tile: it only ever shows the entry just opened.
const opened = ref<Entry | undefined>(undefined);

const remove = async () => {
    const entry = opened.value;
    if (!entry) return;
    await removeUserActivity({
        type: "highlighted",
        contentId: entry.content._id,
        parentId: entry.content.parentId,
    });
};
</script>

<template>
    <div data-test="activity-highlighted">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <ActivityCard
                v-for="entry in entries"
                :key="entry.content._id"
                :content="entry.content"
                type="highlighted"
                :excerpt="entry.ranges[0]?.text"
                :excerpt-color="entry.ranges[0]?.color"
                opens-detail
                @open="opened = entry"
            />
        </div>
        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.highlighted.empty_page") }}
        </div>

        <ActivityHighlightPanel
            :open="!!opened"
            :content="opened?.content"
            :ranges="opened?.ranges ?? []"
            @update:open="opened = undefined"
            @remove="remove"
        />
    </div>
</template>
