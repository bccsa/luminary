<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { type ContentDto } from "luminary-shared";
import ActivityCard from "./ActivityCard.vue";
import ActivityHighlightPanel from "./ActivityHighlightPanel.vue";
import { groupByActivityDate } from "./activityGroups";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";
import { removeUserActivity } from "@/userActivity/store";
import type { UserActivityDoc } from "@/userActivity/types";
import { type HighlightRange } from "@/util/highlightRanges";

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

type Entry = { row: UserActivityDoc; content: ContentDto };

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

const remove = (entry: Entry) =>
    removeUserActivity(
        entry.row.type === "highlighted"
            ? {
                  type: "highlighted",
                  contentId: entry.content._id,
                  parentId: entry.content.parentId,
              }
            : { type: entry.row.type, parentId: entry.row.parentId },
    );

// One panel for the feed rather than one per card: it only ever shows the entry just opened.
const opened = ref<Entry | undefined>(undefined);
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
                    removable
                    @remove="remove(entry)"
                    @open="opened = entry"
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
            @update:open="opened = undefined"
            @remove="opened && remove(opened)"
        />
    </div>
</template>
