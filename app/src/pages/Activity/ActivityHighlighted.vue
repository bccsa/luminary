<script lang="ts" setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightColor, type HighlightRange } from "luminary-shared";
import HighlightCard from "./HighlightCard.vue";
import ActivitySection from "./ActivitySection.vue";
import { groupByActivityDate } from "./activityGroups";
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

type Entry = { content: ContentDto; range: HighlightRange; updatedTimeUtc: number };

/** One entry per saved passage, so each can be filtered by colour and opened on its own. */
const entries = computed<Entry[]>(() =>
    highlighted.value
        .flatMap((row) => {
            const translation = content.value.find((c) => c._id === row.contentId);
            return translation
                ? (row.payload?.ranges ?? []).map((range) => ({
                      content: translation,
                      range,
                      updatedTimeUtc: row.updatedTimeUtc,
                  }))
                : [];
        })
        .filter((entry) => !props.colour || entry.range.color === props.colour),
);

const sections = computed(() => groupByActivityDate(entries.value, (e) => e.updatedTimeUtc));
</script>

<template>
    <div data-test="activity-highlighted">
        <ActivitySection
            v-for="section in sections"
            :key="section.group"
            :group="section.group"
        >
            <div class="flex flex-col gap-3">
                <HighlightCard
                    v-for="entry in section.items"
                    :key="`${entry.content._id}-${entry.range.start}`"
                    :content="entry.content"
                    :range="entry.range"
                    @open="openHighlight(router, entry.content.slug, entry.range)"
                />
            </div>
        </ActivitySection>
        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.highlighted.empty_page") }}
        </div>
    </div>
</template>
