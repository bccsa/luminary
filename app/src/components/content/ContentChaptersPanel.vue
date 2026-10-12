<script setup lang="ts">
/**
 * The chapters of the video on a content page, and what to watch after it.
 *
 * Beside the content on a wide screen it is a column of text rows, a few around the playing chapter.
 * Under the player, where there is no room beside it, it is the same panel attached to the player's foot,
 * its rows led by a frame of the video and its fold arrow putting it away for someone who came to read.
 * "Show all" opens the rest in either place.
 *
 * There is a tab only for what exists: no chapters, no Chapters tab; nothing leads on from this
 * video, no Up next tab; neither, and nothing is drawn.
 */
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronUpIcon } from "@heroicons/vue/20/solid";
import { chapterIndexAt } from "@luminary-media-converter/player-web";
import type { Chapter, ThumbnailSpriteCue } from "@luminary-media-converter/player-web";
import type { ContentDto, Uuid } from "luminary-shared";
import ChapterRow from "@/media-player/ChapterRow.vue";
import MediaPlayerUpNext from "@/media-player/MediaPlayerUpNext.vue";
import type { UpNext } from "@/media-player/useUpNext";
import { chapterProgress } from "@/media-player/chapterProgress";
import { chaptersPanelFolded } from "@/globalConfig";

type PanelTab = "chapters" | "upnext";

/** Width of a chapter's frame under the player; beside the content the rows have none. */
const FRAME_WIDTH = 100;

/** How many chapters, and how many videos to go on to, show before "Show all". */
const ROWS = {
    wide: { chapters: 7, upNext: 4 },
    stacked: { chapters: 4, upNext: 2 },
} as const;

const props = defineProps<{
    chapters: Chapter[];
    currentTime: number;
    upNext: UpNext;
    selectedTag: Uuid | null;
    /** The column beside the content, rather than the panel under the player. */
    wide: boolean;
    /** Under the player: joined to its foot, so the two read as one card. */
    attached?: boolean;
    /** A frame of the video at a time, for the rows to lead with; the column draws text rows either way. */
    cueAt?: (time: number) => ThumbnailSpriteCue | null;
}>();
const emit = defineEmits<{
    "seek-chapter": [chapter: Chapter];
    "play-next": [content: ContentDto];
    "select-tag": [tag: Uuid | null];
}>();
const { t } = useI18n();

/** "Show all": the page lets go of the column's place in view while it is open. */
const expanded = defineModel<boolean>("expanded", { default: false });

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

/** The tab the viewer chose; until then the first. */
const chosen = ref<PanelTab | null>(null);
const open = computed<PanelTab | null>(() => {
    const ids = tabs.value.map((tab) => tab.id);
    return chosen.value && ids.includes(chosen.value) ? chosen.value : (ids[0] ?? null);
});

/** The panel put away, under the player; the column is never put away. */
const folded = computed(() => !props.wide && chaptersPanelFolded.value);

function choose(tab: PanelTab) {
    chosen.value = tab;
    // Choosing a tab asks to see it.
    chaptersPanelFolded.value = false;
}

/** Arrow keys move between the tabs and choose the one they land on, as a row of tabs does. */
function onTabsKeydown(event: KeyboardEvent) {
    const ids = tabs.value.map((tab) => tab.id);
    const from = ids.findIndex((id) => id === (event.target as HTMLElement | null)?.dataset.tab);
    if (from < 0 || ids.length < 2) return;
    const to =
        event.key === "ArrowRight"
            ? (from + 1) % ids.length
            : event.key === "ArrowLeft"
              ? (from + ids.length - 1) % ids.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? ids.length - 1
                  : -1;
    if (to < 0) return;
    event.preventDefault();
    const id = ids[to]!;
    choose(id);
    void nextTick(() =>
        (event.currentTarget as HTMLElement | null)
            ?.querySelector<HTMLElement>(`[data-tab="${id}"]`)
            ?.focus(),
    );
}

watch(
    () => props.wide,
    () => {
        expanded.value = false;
    },
);

const current = computed(() => chapterIndexAt(props.chapters, props.currentTime));
const positionText = computed(() =>
    props.chapters.length && current.value >= 0
        ? t("media_player.chapter_position", {
              index: current.value + 1,
              count: props.chapters.length,
          })
        : "",
);

const rows = computed(() => (props.wide ? ROWS.wide : ROWS.stacked));

/** The rows shown: a window around the playing chapter, or every one when opened. */
const chapterRows = computed(() => {
    const all = props.chapters.map((chapter, index) => ({ chapter, index }));
    const cap = rows.value.chapters;
    if (expanded.value || all.length <= cap) return all;
    const start = Math.max(0, Math.min(current.value - 1, all.length - cap));
    return all.slice(start, start + cap);
});
const moreChapters = computed(() => props.chapters.length > rows.value.chapters);

/** The same for what leads on: the next in the series first, then the related. */
const upNextShown = computed<UpNext>(() => {
    if (expanded.value) return props.upNext;
    const cap = rows.value.upNext;
    const next = props.upNext.next.slice(0, cap);
    const related = props.upNext.related.slice(0, Math.max(0, cap - next.length));
    return { ...props.upNext, next, related };
});
const moreUpNext = computed(
    () => props.upNext.next.length + props.upNext.related.length > rows.value.upNext,
);
</script>

<template>
    <section
        v-if="tabs.length"
        class="overflow-hidden border border-zinc-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        :class="attached ? 'rounded-b-xl border-t-0' : 'rounded-xl'"
        :aria-label="t('singlecontent.chapters_panel')"
        data-test="chaptersPanel"
    >
        <div
            role="tablist"
            class="flex border-b border-zinc-200 dark:border-slate-700"
            :class="{ 'border-b-0': folded }"
            @keydown="onTabsKeydown"
        >
            <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                role="tab"
                class="flex min-h-[48px] items-center justify-center gap-1.5 border-b-2 px-4 text-sm font-semibold"
                :class="
                    open === tab.id && !folded
                        ? 'border-yellow-500 text-zinc-900 dark:text-white'
                        : 'border-transparent text-zinc-500 dark:text-slate-400'
                "
                :aria-selected="open === tab.id"
                :aria-controls="`chapters-panel-${tab.id}`"
                :tabindex="open === tab.id ? 0 : -1"
                :data-tab="tab.id"
                :data-test="`chaptersPanelTab-${tab.id}`"
                @click="choose(tab.id)"
            >
                {{ tab.label }}
                <span class="text-xs font-normal tabular-nums text-zinc-500 dark:text-slate-400">{{
                    tab.count
                }}</span>
            </button>
            <!-- Where the playhead is among the chapters. -->
            <span
                v-if="positionText"
                class="ml-auto self-center text-sm tabular-nums text-zinc-500 dark:text-slate-400"
                :class="wide ? 'pr-4' : 'pr-1'"
                data-test="chaptersPanelPosition"
                >{{ positionText }}</span
            >
            <button
                v-if="!wide"
                type="button"
                class="m-1 flex min-h-[44px] min-w-[44px] items-center justify-center self-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                :class="{ 'ml-auto': !positionText }"
                :aria-expanded="!folded"
                aria-controls="chapters-panel-body"
                :aria-label="
                    folded
                        ? t('singlecontent.chapters_panel_show')
                        : t('singlecontent.chapters_panel_hide')
                "
                data-test="chaptersPanelFold"
                @click="chaptersPanelFolded = !chaptersPanelFolded"
            >
                <ChevronUpIcon
                    class="h-5 w-5 transition-transform motion-reduce:transition-none"
                    :class="{ 'rotate-180': folded }"
                    aria-hidden="true"
                />
            </button>
        </div>

        <div
            v-show="!folded"
            id="chapters-panel-body"
        >
            <div
                v-if="open === 'chapters'"
                id="chapters-panel-chapters"
                role="tabpanel"
                data-test="chaptersPanelChapters"
            >
                <ol
                    class="space-y-1 px-2 py-2"
                    :class="{ 'max-h-[430px] overflow-y-auto': !wide && expanded }"
                >
                    <li
                        v-for="{ chapter, index } in chapterRows"
                        :key="`${chapter.startTime}-${index}`"
                    >
                        <ChapterRow
                            :chapter="chapter"
                            :current="index === current"
                            :cue="wide ? null : (cueAt?.(chapter.startTime) ?? null)"
                            :frame-width="FRAME_WIDTH"
                            :progress="chapterProgress(chapter, currentTime)"
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
                <div :class="{ 'max-h-[430px] overflow-y-auto': !wide && expanded }">
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
        </div>
    </section>
</template>
