<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import type { Chapter, ThumbnailSpriteCue } from "@luminary-media-converter/player-web";
import type { PlayerMessages } from "../messages";
import { formatClock } from "../ui/scrubPreview";
import { withSectionHeadings, type PlayerUpNextItem } from "../upNext";
import NextUpThumb from "./NextUpThumb.vue";

/**
 * Chapters and up next, in a panel over the picture: tabs for what there is, a list under them, a close button.
 * Wide, it is a panel from the right; the web player and the now-playing screen both show it, so it looks and
 * behaves the same in both: Escape closes it, the arrow keys move between tabs, and a tap outside closes it.
 *
 * It holds nothing of its own beyond which tab is showing: what is picked goes out as an event, and the host
 * decides what follows (and closes the panel).
 */
const props = defineProps<{
    chapters: readonly Chapter[];
    /** The chapter the playhead is in; -1 for none. */
    currentChapter: number;
    upNext?: readonly PlayerUpNextItem[];
    messages: PlayerMessages;
    /** An id prefix, so two players on a page do not share element ids. */
    idPrefix: string;
    /** The tab to open on, when it has anything to show. */
    initialTab?: "chapters" | "upnext";
    /** The scrub preview's frame at a time, once its thumbnails are in: each chapter shows the one near its start. */
    thumbnailAt?: (seconds: number) => ThumbnailSpriteCue | null;
}>();

const emit = defineEmits<{
    close: [];
    "pick-chapter": [chapter: Chapter];
    "pick-upnext": [id: string];
}>();

type Tab = "chapters" | "upnext";

const upNextRows = computed(() => withSectionHeadings(props.upNext ?? []));

/** A tab with nothing in it is not offered. */
const tabs = computed<{ id: Tab; label: string }[]>(() => [
    ...(props.chapters.length ? [{ id: "chapters" as const, label: props.messages.chapters }] : []),
    ...(upNextRows.value.length ? [{ id: "upnext" as const, label: props.messages.upNext }] : []),
]);

const requested = ref<Tab>(props.initialTab ?? "chapters");
const active = computed<Tab | null>(
    () => tabs.value.find((tab) => tab.id === requested.value)?.id ?? tabs.value[0]?.id ?? null,
);

const el = ref<HTMLElement | null>(null);
const baseId = `${props.idPrefix}-browse`;
const tabId = (tab: Tab): string => `${baseId}-tab-${tab}`;

/** Start times share one format, so a long video's list lines up. */
const haveHours = computed(() => props.chapters.some((chapter) => chapter.startTime >= 3600));

/**
 * A chapter's picture: the preview frame just after its start (the very start can be the frame before the cut), cut
 * out of its sprite sheet and scaled to the tile. A sheet's whole size is not in a cue, so the crop is drawn at its
 * own size and the whole scaled, as the scrub preview does.
 */
const chapterFrames = computed(() =>
    props.chapters.map((chapter) => {
        const cue = props.thumbnailAt?.(chapter.startTime + 0.5) ?? null;
        if (!cue) return null;
        if (!cue.w || !cue.h) {
            return {
                backgroundImage: `url("${cue.spriteUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                inset: "0",
            };
        }
        return {
            width: `${cue.w}px`,
            height: `${cue.h}px`,
            backgroundImage: `url("${cue.spriteUrl}")`,
            backgroundPosition: `-${cue.x}px -${cue.y}px`,
            "--lmpl-cue-w": String(cue.w),
        };
    }),
);

function selectTab(tab: Tab, focus = false): void {
    requested.value = tab;
    if (focus) void nextTick(() => document.getElementById(tabId(tab))?.focus());
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        emit("close");
        return;
    }
    const all = tabs.value;
    const onTab = event.target instanceof Element && event.target.closest('[role="tab"]') !== null;
    if (!onTab || all.length < 2) return;
    const index = all.findIndex((tab) => tab.id === active.value);
    const last = all.length - 1;
    const next =
        event.key === "ArrowRight"
            ? (index + 1) % all.length
            : event.key === "ArrowLeft"
              ? (index + last) % all.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? last
                  : -1;
    if (next < 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectTab(all[next]!.id, true);
}

// Opened: the chapter playing is in view, and the tab that is showing has the focus.
onMounted(async () => {
    requested.value = active.value ?? "chapters";
    await nextTick();
    el.value
        ?.querySelector<HTMLElement>('[aria-current="true"]')
        ?.scrollIntoView?.({ block: "center" });
    el.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
});

/** Whether the focus is in the panel, so the host knows to give it back to its button. */
function hasFocus(): boolean {
    return el.value?.contains(document.activeElement) ?? false;
}
defineExpose({ hasFocus });
</script>

<template>
    <!-- Taps outside close it; stopped here so they do not also pause the video. -->
    <div
        class="lmpl-browse-scrim"
        aria-hidden="true"
        @pointerdown.stop
        @pointerup.stop
        @dblclick.stop
        @click.stop="emit('close')"
    ></div>
    <div
        :id="baseId"
        ref="el"
        class="lmpl-browse"
        role="dialog"
        :aria-label="messages.browse"
        data-test="browsePanel"
        @keydown="onKeydown"
        @pointerdown.stop
        @pointerup.stop
        @dblclick.stop
        @click.stop
    >
        <div class="lmpl-browse-head">
            <div
                class="lmpl-browse-tabs"
                role="tablist"
                :aria-label="messages.browse"
            >
                <button
                    v-for="tab in tabs"
                    :id="tabId(tab.id)"
                    :key="tab.id"
                    type="button"
                    role="tab"
                    class="lmpl-browse-tab"
                    :aria-selected="active === tab.id"
                    :aria-controls="`${tabId(tab.id)}-panel`"
                    :tabindex="active === tab.id ? 0 : -1"
                    @click="selectTab(tab.id)"
                >
                    {{ tab.label }}
                </button>
            </div>
            <button
                type="button"
                class="media-button lmpl-icon-btn lmpl-browse-close"
                :aria-label="messages.closeBrowse"
                @click="emit('close')"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    aria-hidden="true"
                >
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </div>

        <div
            v-if="active"
            :id="`${tabId(active)}-panel`"
            class="lmpl-browse-body"
            role="tabpanel"
            :aria-labelledby="tabId(active)"
        >
            <ol
                v-if="active === 'chapters'"
                class="lmpl-browse-list"
            >
                <li
                    v-for="(chapter, index) in chapters"
                    :key="`${chapter.startTime}-${index}`"
                >
                    <button
                        type="button"
                        class="lmpl-browse-row lmpl-chapter"
                        :aria-current="index === currentChapter ? 'true' : undefined"
                        @click="emit('pick-chapter', chapter)"
                    >
                        <span
                            class="lmpl-upnext-thumb lmpl-chapter-tile"
                            aria-hidden="true"
                        >
                            <span
                                v-if="chapterFrames[index]"
                                class="lmpl-chapter-frame"
                                :style="chapterFrames[index]!"
                                data-test="chapterFrame"
                            ></span>
                            <svg
                                v-else
                                viewBox="0 0 24 24"
                                width="22"
                                height="22"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M10 6h10M10 12h10M10 18h10" />
                                <rect
                                    x="3.5"
                                    y="4.5"
                                    width="3"
                                    height="3"
                                    rx="0.8"
                                />
                                <rect
                                    x="3.5"
                                    y="10.5"
                                    width="3"
                                    height="3"
                                    rx="0.8"
                                    fill="currentColor"
                                />
                                <rect
                                    x="3.5"
                                    y="16.5"
                                    width="3"
                                    height="3"
                                    rx="0.8"
                                />
                            </svg>
                        </span>
                        <span class="lmpl-upnext-text">
                            <span class="lmpl-upnext-title">{{ chapter.title }}</span>
                            <span class="lmpl-upnext-subtitle lmpl-chapter-time">{{
                                formatClock(chapter.startTime, haveHours)
                            }}</span>
                        </span>
                    </button>
                </li>
            </ol>
            <ul
                v-else
                class="lmpl-browse-list"
            >
                <template
                    v-for="row in upNextRows"
                    :key="row.item.id"
                >
                    <li
                        v-if="row.heading"
                        class="lmpl-browse-heading"
                        role="presentation"
                    >
                        {{ row.heading }}
                    </li>
                    <li>
                        <button
                            type="button"
                            class="lmpl-browse-row lmpl-upnext"
                            :aria-current="row.item.current ? 'true' : undefined"
                            @click="row.item.current || emit('pick-upnext', row.item.id)"
                        >
                            <span class="lmpl-upnext-thumb">
                                <!-- As the up next strip's cards: the picture, else its fallback, else the plain tile. -->
                                <NextUpThumb :item="row.item" />
                            </span>
                            <span class="lmpl-upnext-text">
                                <span class="lmpl-upnext-title">{{ row.item.title }}</span>
                                <span
                                    v-if="row.item.subtitle"
                                    class="lmpl-upnext-subtitle"
                                    >{{ row.item.subtitle }}</span
                                >
                            </span>
                        </button>
                    </li>
                </template>
            </ul>
        </div>
    </div>
</template>
