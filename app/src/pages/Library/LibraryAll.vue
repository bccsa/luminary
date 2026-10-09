<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { type ContentDto } from "luminary-shared";
import LibraryActivityCard from "./LibraryActivityCard.vue";
import LDialog from "@/components/common/LDialog.vue";
import { groupByActivityDate } from "./activityGroups";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";
import { removeUserActivity } from "@/userActivity/store";
import type { UserActivityDoc } from "@/userActivity/db";
import { HIGHLIGHT_COLORS, type HighlightRange } from "@/util/highlightRanges";

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

// One dialog for the panel rather than one per card: it only ever shows the entry just
// opened. Colour filtering stays in the Highlighted panel, which is the place for it.
const opened = ref<Entry | undefined>(undefined);

const openArticle = () => {
    const slug = opened.value?.content.slug;
    if (slug) router.push({ name: "content", params: { slug } });
};
</script>

<template>
    <div data-test="library-all">
        <section
            v-for="section in sections"
            :key="section.group"
            class="mb-6"
        >
            <h2
                class="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400"
                :data-test="`library-group-${section.group}`"
            >
                {{ t(`library.group.${section.group}`) }}
            </h2>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <LibraryActivityCard
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
            {{ t("library.all.empty_page") }}
        </div>

        <LDialog
            v-if="opened"
            :open="true"
            :title="opened.content.title"
            :primaryAction="openArticle"
            :primaryButtonText="t('library.highlights.open_article')"
            @update:open="opened = undefined"
        >
            <ul class="space-y-2">
                <li
                    v-for="(range, index) in rangesOf(opened)"
                    :key="`${range.start}-${index}`"
                    class="border-l-4 pl-3 text-sm text-zinc-700 dark:text-slate-200"
                    :style="{ borderColor: HIGHLIGHT_COLORS[range.color] }"
                    data-test="highlight-text"
                >
                    {{ range.text }}
                </li>
            </ul>
        </LDialog>
    </div>
</template>
