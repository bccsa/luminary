<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { type ContentDto } from "luminary-shared";
import ContentTile from "@/components/content/ContentTile.vue";
import LDialog from "@/components/common/LDialog.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useUserActivity } from "@/userActivity/useUserActivity";
import { removeUserActivity } from "@/userActivity/store";
import { HIGHLIGHT_COLORS, type HighlightColor, type HighlightRange } from "@/util/highlightRanges";

const { t } = useI18n();
const router = useRouter();

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

// One dialog for the panel rather than one per tile: it only ever shows the entry just opened.
const opened = ref<Entry | undefined>(undefined);
const colour = ref<HighlightColor | undefined>(undefined);

const open = (entry: Entry) => {
    colour.value = undefined;
    opened.value = entry;
};

/** Only the colours actually used, in the palette's order, so the filter has no dead chips. */
const colours = computed(() =>
    (Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).filter((c) =>
        opened.value?.ranges.some((range) => range.color === c),
    ),
);

const shown = computed(() =>
    colour.value
        ? (opened.value?.ranges ?? []).filter((r) => r.color === colour.value)
        : (opened.value?.ranges ?? []),
);

const chipClass = (active: boolean) =>
    active
        ? "bg-zinc-700 text-white dark:bg-slate-100 dark:text-slate-900"
        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300";

const openArticle = () => {
    const slug = opened.value?.content.slug;
    if (slug) router.push({ name: "content", params: { slug } });
};

// Deleting is asked for in the passages dialog but confirmed in its own: the first closes so
// the two never stack, and cancelling returns to the passages rather than dropping the reader.
const confirming = ref<Entry | undefined>(undefined);

const askToDelete = () => {
    confirming.value = opened.value;
    opened.value = undefined;
};

const cancelDelete = () => {
    opened.value = confirming.value;
    confirming.value = undefined;
};

const remove = async () => {
    const entry = confirming.value;
    confirming.value = undefined;
    if (!entry) return;
    await removeUserActivity({
        type: "highlighted",
        contentId: entry.content._id,
        parentId: entry.content.parentId,
    });
};
</script>

<template>
    <div data-test="library-highlighted">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <!-- Capturing the click leaves ContentTile untouched — its link, hover and focus all
                 keep working — while the tile opens its passages instead of navigating. -->
            <div
                v-for="entry in entries"
                :key="entry.content._id"
                class="cursor-pointer"
                data-test="library-open-highlights"
                @click.capture.stop.prevent="open(entry)"
            >
                <ContentTile
                    :content="entry.content"
                    layout="card"
                    class="h-full w-full"
                />
            </div>
        </div>
        <div
            v-if="!entries.length"
            class="text-zinc-500 dark:text-slate-200"
        >
            {{ t("library.highlighted.empty_page") }}
        </div>

        <LDialog
            v-if="opened"
            :open="true"
            :title="opened.content.title"
            :primaryAction="openArticle"
            :primaryButtonText="t('library.highlights.open_article')"
            :secondaryAction="askToDelete"
            :secondaryButtonText="t('library.remove.button')"
            @update:open="opened = undefined"
        >
            <div class="space-y-4">
                <!-- A single colour needs no filter: the chips would only state what is shown. -->
                <div
                    v-if="colours.length > 1"
                    class="flex flex-wrap gap-2"
                >
                    <button
                        type="button"
                        class="rounded-full px-3 py-1 text-sm transition-colors"
                        :class="chipClass(colour === undefined)"
                        data-test="highlight-colour-all"
                        @click="colour = undefined"
                    >
                        {{ t("library.highlights.all_colours") }}
                    </button>
                    <button
                        v-for="c in colours"
                        :key="c"
                        type="button"
                        class="flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors"
                        :class="chipClass(colour === c)"
                        :data-test="`highlight-colour-${c}`"
                        @click="colour = c"
                    >
                        <span
                            class="h-3 w-3 rounded-full"
                            :style="{ backgroundColor: HIGHLIGHT_COLORS[c] }"
                        />
                        {{ t(`singlecontent.highlightColor.${c}`) }}
                    </button>
                </div>

                <ul class="space-y-2">
                    <li
                        v-for="(range, index) in shown"
                        :key="`${range.start}-${index}`"
                        class="border-l-4 pl-3 text-sm text-zinc-700 dark:text-slate-200"
                        :style="{ borderColor: HIGHLIGHT_COLORS[range.color] }"
                        data-test="highlight-text"
                    >
                        {{ range.text }}
                    </li>
                </ul>
            </div>
        </LDialog>

        <LDialog
            v-if="confirming"
            :open="true"
            :title="t('library.remove.confirm.title')"
            :description="t('library.remove.confirm.description')"
            :primaryAction="remove"
            :primaryButtonText="t('library.remove.button')"
            :secondaryAction="cancelDelete"
            :secondaryButtonText="t('library.remove.confirm.button_cancel')"
            context="danger"
            @update:open="cancelDelete"
        />
    </div>
</template>
