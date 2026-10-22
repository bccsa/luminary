<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto, type HighlightRange, type UserActivityEntry } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import ActivityHighlightPanel from "./ActivityHighlightPanel.vue";
import { groupByActivityDate } from "./activityGroups";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";

const { t } = useI18n();

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

type Entry = { row: UserActivityEntry; content: ContentDto };

/**
 * One card per activity, in the order the table returned — so the same post appears once
 * per thing the reader did to it. An activity whose content is not available is left out.
 */
const entries = computed<Entry[]>(() =>
    activity.value
        .map((row) => ({
            row,
            content: row.contentId
                ? translations.value.find((c) => c._id === row.contentId)
                : posts.value.find((c) => c.parentId === row.parentId),
        }))
        .filter((entry): entry is Entry => !!entry.content),
);

const sections = computed(() => groupByActivityDate(entries.value, (e) => e.row.updatedTimeUtc));

const rangesOf = (entry: Entry): HighlightRange[] => entry.row.payload?.ranges ?? [];

// One panel for the feed rather than one per card: it only ever shows the entry just opened.
// Held by row id and looked up again, so removing a passage updates the panel and removing the
// last one closes it.
const openedId = ref<string | undefined>(undefined);
const opened = computed(() => entries.value.find((e) => e.row._id === openedId.value));
</script>

<template>
    <div data-test="activity-all">
        <section
            v-for="section in sections"
            :key="section.group"
            class="mb-6"
        >
            <h2
                class="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400"
                :data-test="`activity-group-${section.group}`"
            >
                {{ t(`activity.group.${section.group}`) }}
            </h2>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <ActivityCard
                    v-for="entry in section.items"
                    :key="entry.row._id"
                    :content="entry.content"
                    :type="entry.row.type"
                    :excerpt="rangesOf(entry)[0]?.text"
                    :excerpt-color="rangesOf(entry)[0]?.color"
                    :opens-detail="entry.row.type === 'highlighted'"
                    @open="openedId = entry.row._id"
                />
            </div>
        </section>

        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("activity.all.empty_page") }}
        </div>

        <ActivityHighlightPanel
            :open="!!opened"
            :content="opened?.content"
            :ranges="opened ? rangesOf(opened) : []"
            @update:open="openedId = undefined"
        />
    </div>
</template>
