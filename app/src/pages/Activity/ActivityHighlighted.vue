<script lang="ts" setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightColor, type HighlightRange } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";
import { openHighlight } from "@/util/openHighlight";

const { t } = useI18n();
const router = useRouter();

const props = defineProps<{ colour?: HighlightColor }>();

// A highlight belongs to one translation, so its card shows that translation rather than the
// post: two languages of the same post are two separate entries here.
const highlighted = useUserActivity("highlighted");
const contentIds = computed(() => highlighted.value.map((row) => row.contentId as string));

const content = useContentQuery(() => [{ _id: { $in: contentIds.value } }], {
    includeScheduled: false,
    // The user read this translation to highlight it, so it belongs here whether or not its
    // language is still among the ones they display.
    languageFilter: false,
    keepPreviousResult: true,
});

type Entry = { content: ContentDto; range: HighlightRange };

/** One entry per saved passage, so each can be filtered by colour and opened on its own. */
const entries = computed<Entry[]>(() =>
    highlighted.value
        .flatMap((row) => {
            const translation = content.value.find((c) => c._id === row.contentId);
            return translation
                ? (row.payload?.ranges ?? []).map((range) => ({ content: translation, range }))
                : [];
        })
        .filter((entry) => !props.colour || entry.range.color === props.colour),
);
</script>

<template>
    <div data-test="activity-highlighted">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <ActivityCard
                v-for="entry in entries"
                :key="`${entry.content._id}-${entry.range.start}`"
                :content="entry.content"
                type="highlighted"
                :excerpt="entry.range.text"
                :excerpt-color="entry.range.color"
                opens-passage
                @open="openHighlight(router, entry.content.slug, entry.range)"
            />
        </div>
        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.highlighted.empty_page") }}
        </div>
    </div>
</template>
