<script setup lang="ts">
/**
 * The chapters of the video on a content page, and what to watch after it.
 *
 * Wide, it is a column beside the content: a few rows around the playing chapter, and "Show all" to
 * open the rest in place, so the column never scrolls inside itself. Narrower, it is a strip of two
 * tabs under the player, as the expanded player's sheet has on a phone: choosing a tab opens its
 * list below, choosing it again closes it.
 *
 * There is a tab only for what exists: no chapters, no Chapters tab; nothing leads on from this
 * video, no Up next tab; neither, and nothing is drawn.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronUpIcon } from "@heroicons/vue/20/solid";
import { chapterIndexAt } from "@luminary-media-converter/player-web";
import type { Chapter, ThumbnailSpriteCue } from "@luminary-media-converter/player-web";
import type { ContentDto, Uuid } from "luminary-shared";
import ChapterRow from "@/media-player/ChapterRow.vue";
import MediaPlayerUpNext from "@/media-player/MediaPlayerUpNext.vue";
import type { UpNext } from "@/media-player/useUpNext";

type PanelTab = "chapters" | "upnext";

/** How many chapters, and how many videos to go on to, the column shows before "Show all". */
const WIDE_CHAPTER_ROWS = 7;
const WIDE_UP_NEXT_ROWS = 4;

const props = defineProps<{
    chapters: Chapter[];
    currentTime: number;
    upNext: UpNext;
    selectedTag: Uuid | null;
    /** The column beside the content, rather than the strip under the player. */
    wide: boolean;
    /** A frame of the video at a time, for the rows to lead with; the column draws text rows either way. */
    cueAt?: (time: number) => ThumbnailSpriteCue | null;
}>();
const emit = defineEmits<{
    "seek-chapter": [chapter: Chapter];
    "play-next": [content: ContentDto];
    "select-tag": [tag: Uuid | null];
}>();
const { t } = useI18n();

const hasUpNext = computed(
    () => props.upNext.next.length > 0 || props.upNext.related.length > 0 || !!props.selectedTag,
);
const tabs = computed<{ id: PanelTab; label: string; count: number }[]>(() => [
    ...(props.chapters.length
        ? [
              {
                  id: "chapters" as const,
                  label: t("media_player.chapters"),
                  count: props.chapters.length,
              },
          ]
        : []),
    ...(hasUpNext.value
        ? [
              {
                  id: "upnext" as const,
                  label: t("media_player.up_next"),
                  count: props.upNext.next.length + props.upNext.related.length,
              },
          ]
        : []),
]);

/** The tab the viewer chose; in the strip, none is closed. */
const chosen = ref<PanelTab | null>(null);
/** The column's "Show all". */
const expanded = ref(false);

/** Wide, one tab is always open; in the strip, only the one chosen. */
const open = computed<PanelTab | null>(() => {
    const ids = tabs.value.map((tab) => tab.id);
    if (chosen.value && ids.includes(chosen.value)) return chosen.value;
    return props.wide ? (ids[0] ?? null) : null;
});

function choose(tab: PanelTab) {
    // The strip's tabs toggle; the column's switch.
    chosen.value = !props.wide && open.value === tab ? null : tab;
}
watch(
    () => props.wide,
    () => {
        chosen.value = null;
        expanded.value = false;
    },
);

const current = computed(() => chapterIndexAt(props.chapters, props.currentTime));

/** The rows the column shows: a window around the playing chapter, or every one when opened. */
const chapterRows = computed(() => {
    const all = props.chapters.map((chapter, index) => ({ chapter, index }));
    if (!props.wide || expanded.value || all.length <= WIDE_CHAPTER_ROWS) return all;
    const start = Math.max(0, Math.min(current.value - 1, all.length - WIDE_CHAPTER_ROWS));
    return all.slice(start, start + WIDE_CHAPTER_ROWS);
});
const moreChapters = computed(() => props.wide && props.chapters.length > WIDE_CHAPTER_ROWS);

/** The same for what leads on: the next in the series first, then the related. */
const upNextShown = computed<UpNext>(() => {
    if (!props.wide || expanded.value) return props.upNext;
    const next = props.upNext.next.slice(0, WIDE_UP_NEXT_ROWS);
    const related = props.upNext.related.slice(0, Math.max(0, WIDE_UP_NEXT_ROWS - next.length));
    return { ...props.upNext, next, related };
});
const moreUpNext = computed(
    () => props.wide && props.upNext.next.length + props.upNext.related.length > WIDE_UP_NEXT_ROWS,
);
</script>

<template>
    <section
        v-if="tabs.length"
        class="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        :aria-label="t('singlecontent.chapters_panel')"
        data-test="chaptersPanel"
    >
        <div
            role="tablist"
            class="flex border-b border-zinc-200 dark:border-slate-700"
            :class="{ 'border-b-0': !wide && !open }"
        >
            <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                role="tab"
                class="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold"
                :class="
                    open === tab.id
                        ? 'border-yellow-500 text-zinc-900 dark:text-white'
                        : 'border-transparent text-zinc-500 dark:text-slate-400'
                "
                :aria-selected="open === tab.id"
                :aria-expanded="wide ? undefined : open === tab.id"
                :aria-controls="`chapters-panel-${tab.id}`"
                :data-test="`chaptersPanelTab-${tab.id}`"
                @click="choose(tab.id)"
            >
                <ChevronUpIcon
                    v-if="!wide"
                    class="h-4 w-4 transition-transform motion-reduce:transition-none"
                    :class="{ 'rotate-180': open === tab.id }"
                    aria-hidden="true"
                />
                {{ tab.label }}
                <span class="text-xs font-normal tabular-nums text-zinc-500 dark:text-slate-400">{{
                    tab.count
                }}</span>
            </button>
        </div>

        <div
            v-if="open === 'chapters'"
            id="chapters-panel-chapters"
            role="tabpanel"
            data-test="chaptersPanelChapters"
        >
            <ol
                class="space-y-1 px-2 py-2"
                :class="{ 'max-h-[340px] overflow-y-auto': !wide }"
            >
                <li
                    v-for="{ chapter, index } in chapterRows"
                    :key="`${chapter.startTime}-${index}`"
                >
                    <ChapterRow
                        :chapter="chapter"
                        :current="index === current"
                        :cue="wide ? null : (cueAt?.(chapter.startTime) ?? null)"
                        @click="emit('seek-chapter', chapter)"
                    />
                </li>
            </ol>
            <div
                v-if="moreChapters"
                class="flex justify-center pb-2"
            >
                <button
                    type="button"
                    class="min-h-[44px] rounded-full px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    :aria-expanded="expanded"
                    data-test="chaptersPanelMore"
                    @click="expanded = !expanded"
                >
                    {{
                        expanded
                            ? t("media_player.show_less")
                            : t("media_player.show_all_chapters", { count: chapters.length })
                    }}
                </button>
            </div>
        </div>

        <div
            v-else-if="open === 'upnext'"
            id="chapters-panel-upnext"
            role="tabpanel"
            data-test="chaptersPanelUpNext"
        >
            <div :class="{ 'max-h-[400px] overflow-y-auto': !wide }">
                <MediaPlayerUpNext
                    :next="upNextShown.next"
                    :related="upNextShown.related"
                    :tags="upNext.tags"
                    :selected-tag="selectedTag"
                    @select="emit('play-next', $event)"
                    @select-tag="emit('select-tag', $event)"
                />
            </div>
            <div
                v-if="moreUpNext"
                class="flex justify-center pb-2"
            >
                <button
                    type="button"
                    class="min-h-[44px] rounded-full px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    :aria-expanded="expanded"
                    data-test="chaptersPanelMore"
                    @click="expanded = !expanded"
                >
                    {{ expanded ? t("media_player.show_less") : t("media_player.show_all") }}
                </button>
            </div>
        </div>
    </section>
</template>
