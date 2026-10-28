<script lang="ts" setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightRange, type UserActivityEntry } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import ActivitySection from "./ActivitySection.vue";
import { groupByActivityDate } from "./activityGroups";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";
import { openHighlight } from "@/util/openHighlight";

const { t } = useI18n();
const router = useRouter();

const activity = useUserActivity("all");

const parentIds = computed(() => activity.value.map((row) => row.parentId));
const highlightedIds = computed(() =>
    activity.value.filter((row) => row.contentId).map((row) => row.contentId as string),
);

// Likes and views name a post, highlights name one of its translations, so the two are
// looked up separately. The first follows the reader's languages; the second cannot, since
// they read that translation whether or not they still display its language.
const posts = useContentQuery(() => [{ parentId: { $in: parentIds.value } }], {
    includeScheduled: false,
    keepPreviousResult: true,
});

const translations = useContentQuery(() => [{ _id: { $in: highlightedIds.value } }], {
    includeScheduled: false,
    languageFilter: false,
    keepPreviousResult: true,
});

type Entry = { row: UserActivityEntry; content: ContentDto; range?: HighlightRange };

/**
 * One card per activity, in the order the table returned — so the same post appears once
 * per thing the reader did to it. A highlight gets one card per saved passage. An activity
 * whose content is not available is left out.
 */
const entries = computed<Entry[]>(() =>
    activity.value.flatMap((row) => {
        const content = row.contentId
            ? translations.value.find((c) => c._id === row.contentId)
            : posts.value.find((c) => c.parentId === row.parentId);
        if (!content) return [];
        if (row.type !== "highlighted") return [{ row, content }];
        return (row.payload?.ranges ?? []).map((range) => ({ row, content, range }));
    }),
);

const sections = computed(() => groupByActivityDate(entries.value, (e) => e.row.updatedTimeUtc));
</script>

<template>
    <div data-test="activity-all">
        <ActivitySection
            v-for="section in sections"
            :key="section.group"
            :group="section.group"
        >
            <div class="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3">
                <ActivityCard
                    v-for="entry in section.items"
                    :key="`${entry.row._id}-${entry.range?.start ?? ''}`"
                    :content="entry.content"
                    :type="entry.row.type"
                    :excerpt="entry.range?.text"
                    :excerpt-color="entry.range?.color"
                    :opens-passage="!!entry.range"
                    @open="entry.range && openHighlight(router, entry.content.slug, entry.range)"
                />
            </div>
        </ActivitySection>

        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.all.empty_page") }}
        </div>
    </div>
</template>
