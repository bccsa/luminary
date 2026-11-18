<script lang="ts" setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightRange, type UserActivityEntry } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import ActivitySection from "./ActivitySection.vue";
import { groupByActivityDate } from "./activityGroups";
import { useContentQueryWithState } from "@/composables/useContentQuery";
import { useUserActivityWithState } from "@/userActivity/useUserActivity";
import { hasAnswered, useShownOnceLoaded } from "./useShownOnceLoaded";
import { openHighlight } from "@/util/openHighlight";
import { highlightExcerpts } from "@/util/highlightExcerpt";

const { t } = useI18n();
const router = useRouter();

const { rows: activity, loaded } = useUserActivityWithState("all");

const parentIds = computed(() => activity.value.map((row) => row.parentId));
const highlightedIds = computed(() =>
    activity.value.filter((row) => row.contentId).map((row) => row.contentId as string),
);

// Likes and views name a post, highlights name one of its translations, so the two are
// looked up separately. The first follows the reader's languages; the second cannot, since
// they read that translation whether or not they still display its language.
const postsQuery = useContentQueryWithState(() => [{ parentId: { $in: parentIds.value } }], {
    includeScheduled: false,
    keepPreviousResult: true,
});

const translationsQuery = useContentQueryWithState(() => [{ _id: { $in: highlightedIds.value } }], {
    includeScheduled: false,
    languageFilter: false,
    keepPreviousResult: true,
});
const posts = postsQuery.output;
const translations = translationsQuery.output;

// Drawn once both lookups have answered: the highlights alone would otherwise show first and
// then be pushed down by the views and likes, which come back later.
const shown = useShownOnceLoaded(
    () => loaded.value && hasAnswered(postsQuery) && hasAnswered(translationsQuery),
);

type Entry = {
    row: UserActivityEntry;
    content: ContentDto;
    range?: HighlightRange;
    excerpt?: string;
};

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
        const ranges = row.payload?.ranges ?? [];
        const excerpts = highlightExcerpts(content.text, ranges);
        return ranges.map((range, i) => ({ row, content, range, excerpt: excerpts[i] }));
    }),
);

const sections = computed(() => groupByActivityDate(entries.value, (e) => e.row.updatedTimeUtc));
</script>

<template>
    <div data-test="activity-all">
        <template v-if="shown">
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
                        :excerpt="entry.excerpt"
                        :excerpt-color="entry.range?.color"
                        :opens-passage="!!entry.range"
                        @open="
                            entry.range && openHighlight(router, entry.content.slug, entry.range)
                        "
                    />
                </div>
            </ActivitySection>

            <div v-if="!entries.length" class="text-zinc-500 dark:text-slate-200">
                {{ t("activity.all.empty_page") }}
            </div>
        </template>
    </div>
</template>
