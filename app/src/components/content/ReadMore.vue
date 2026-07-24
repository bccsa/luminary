<script lang="ts">
// When the mobile title wraps onto two lines there's only room for a one-line summary; a
// single-line title leaves room for two. (On the card, the summary always uses two lines —
// see the template's sm: clamp.)
export const summaryClampFor = (mobileTitleLines: number): string =>
    mobileTitleLines >= 2 ? "line-clamp-1" : "line-clamp-2";
</script>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { type ContentDto } from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import LImage from "../images/LImage.vue";
import ContentCard from "./ContentCard.vue";
import ReadMoreGhost from "./ReadMoreGhost.vue";

const props = withDefaults(defineProps<{ items: ContentDto[]; ready?: boolean }>(), {
    ready: true,
});

const summaryText = (content: ContentDto): string => content.summary?.trim() ?? "";

const tagIds = computed(() => [...new Set(props.items.flatMap((item) => item.parentTags ?? []))]);
const tagDocs = useContentQuery(
    () => [{ parentId: { $in: tagIds.value.length ? tagIds.value : [] } }],
    { includeScheduled: false },
);
const tagsFor = (content: ContentDto): ContentDto[] => {
    const ids = new Set(content.parentTags ?? []);
    return tagDocs.value.filter((tag) => ids.has(tag.parentId));
};

// Infinite list on every breakpoint: start with one batch and reveal the next whenever
// the sentinel below the list scrolls into view (the grid grows vertically too, so the
// same mechanism serves mobile and desktop).
const BATCH_SIZE = 8;
const visibleCount = ref(BATCH_SIZE);
const visibleItems = computed(() => props.items.slice(0, visibleCount.value));

/** One real, resolved card slot, or a still-loading placeholder. A discriminated union (rather
 *  than a plain `ContentDto | null` slot) so the template narrows cleanly with no non-null
 *  assertions needed in the real-card branch. */
type ReadMoreCell = { kind: "ghost" } | { kind: "item"; content: ContentDto };

// While the feed is still loading (`ready === false`), render exactly one page's worth of
// ghost cells in the SAME grid the real cards use — not a separately swapped component/tree —
// sized to match `BATCH_SIZE` (the real list's own first-page size) so the common case (a
// merged feed with at least a full page of results) has NO size change at all when the real
// cards replace the ghosts: they just fill in over the existing slots instead of the whole
// section resizing and pushing everything below it.
const cells = computed<ReadMoreCell[]>(() =>
    props.ready
        ? visibleItems.value.map((content) => ({ kind: "item" as const, content }))
        : Array.from({ length: BATCH_SIZE }, () => ({ kind: "ghost" as const })),
);

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | undefined;

// How many lines each card's mobile title wraps onto, so the summary can take the remaining
// room (see summaryClampFor). Measured from the rendered height because CSS can't make one
// element's clamp depend on another element's line count.
const rootEl = ref<HTMLElement | null>(null);
const mobileTitleLines = reactive<Record<string, number>>({});
let resizeObserver: ResizeObserver | undefined;

const measureTitles = () => {
    const root = rootEl.value;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-mobile-title]").forEach((el) => {
        const id = el.dataset.id;
        if (!id) return;
        // Hidden (desktop) titles report no height; treat as one line so the summary keeps
        // its two-line clamp — the sm: breakpoint governs the card there anyway.
        if (!el.clientHeight) {
            mobileTitleLines[id] = 1;
            return;
        }
        const styles = getComputedStyle(el);
        const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.5 || 20;
        mobileTitleLines[id] = Math.max(1, Math.round(el.clientHeight / lineHeight));
    });
};

// A card's category row scrolls horizontally when it has more chips than fit. Fade whichever
// edge still has hidden chips beyond it, so the row dissolves toward the card edge instead of
// cutting a chip off — and the fade follows the scroll position.
const tagFade = reactive<Record<string, { left: boolean; right: boolean }>>({});

const FADE_WIDTH = "1rem";
const tagFadeStyle = (id: string) => {
    const fade = tagFade[id];
    const start = fade?.left ? "transparent" : "#000";
    const end = fade?.right ? "transparent" : "#000";
    // A full-black mask leaves the row untouched; a transparent stop fades that edge.
    const mask = `linear-gradient(to right, ${start} 0, #000 ${FADE_WIDTH}, #000 calc(100% - ${FADE_WIDTH}), ${end} 100%)`;
    return { maskImage: mask, WebkitMaskImage: mask };
};

const updateTagFade = (id: string, el: HTMLElement) => {
    const maxScroll = el.scrollWidth - el.clientWidth;
    tagFade[id] = {
        left: el.scrollLeft > 4,
        right: maxScroll > 4 && el.scrollLeft < maxScroll - 4,
    };
};

const measureTagFades = () => {
    const root = rootEl.value;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-tags-row]").forEach((el) => {
        if (el.dataset.id) updateTagFade(el.dataset.id, el);
    });
};

// Titles and category fades both derive from rendered layout, so recompute them together.
const remeasureAll = () => {
    measureTitles();
    measureTagFades();
};

// `rootEl`/`sentinel` exist from the very first mount now — ghost cells live inside the same
// grid as real cards, not a separately swapped component/tree — so a single onMounted setup
// is enough; no need to re-run it later when `ready` flips.
onMounted(() => {
    observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && visibleCount.value < props.items.length) {
            visibleCount.value += BATCH_SIZE;
        }
    });
    if (sentinel.value) observer.observe(sentinel.value);

    // Recompute title line counts and category fades when the layout reflows (e.g. rotating).
    resizeObserver = new ResizeObserver(() => remeasureAll());
    if (rootEl.value) resizeObserver.observe(rootEl.value);
    nextTick(remeasureAll);
});
onUnmounted(() => {
    observer?.disconnect();
    resizeObserver?.disconnect();
});
watch(
    () => props.items,
    () => {
        visibleCount.value = BATCH_SIZE;
    },
);
// Newly revealed cards (infinite scroll, or a new related set) need re-measuring once rendered.
watch(visibleItems, () => nextTick(remeasureAll));
</script>

<template>
    <div ref="rootEl">
        <!-- Mobile: a single-column list of image-left rows. From tablet up: a grid of
             image-top cards with the title bottom-aligned on the image. Fewer columns than
             the Explore rows so the images stay large. Ghost cells (see `cells` above) share
             this exact grid so real cards fill in over them in place instead of the section
             resizing once the feed resolves. -->
        <ul
            class="flex flex-col gap-3 px-4 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-6 sm:px-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
            <li
                v-for="(cell, index) in cells"
                :key="cell.kind === 'item' ? cell.content._id : `ghost-${index}`"
            >
                <ReadMoreGhost v-if="cell.kind === 'ghost'" />
                <template v-else>
                    <!-- Mobile: image-left row (thumbnail, title, tags). Tablet and up: the shared
                         ContentCard design (fluid so it fills the grid cell) instead of duplicating
                         its image+title-overlay+summary markup here. -->
                    <RouterLink
                        :to="{ name: 'content', params: { slug: cell.content.slug } }"
                        class="ease-out-expo group flex gap-2 overflow-hidden rounded-lg bg-white shadow ring-1 ring-zinc-950/10 transition hover:shadow-lg hover:brightness-[1.15] dark:bg-slate-800 dark:ring-white/10 sm:hidden"
                    >
                        <div
                            class="shrink-0 overflow-hidden [&>div>div]:!h-full [&>div]:h-full [&_img]:!h-full"
                        >
                            <LImage
                                :image="cell.content.parentImageData"
                                :content-parent-id="cell.content.parentId"
                                :parent-image-bucket-id="cell.content.parentImageBucketId"
                                aspectRatio="classic"
                                size="thumbnailCompact"
                                :rounded="false"
                            />
                        </div>

                        <!-- Even spacing: the same 8px above the title, below the tags, and to the
                             right of the text (the thumbnail gap sets the left). -->
                        <div class="flex min-w-0 flex-1 flex-col gap-1 p-2 pl-0">
                            <!-- Up to two lines; the summary adapts below. -->
                            <h3
                                :data-id="cell.content._id"
                                data-mobile-title
                                class="-mt-1 line-clamp-2 font-semibold text-zinc-800 dark:text-slate-50"
                            >
                                {{ cell.content.title }}
                            </h3>

                            <!-- Summary takes whatever lines the title leaves: two when the title is
                                 one line, one when the title wrapped to two. -->
                            <p
                                v-if="summaryText(cell.content)"
                                class="text-sm text-zinc-500 dark:text-slate-400"
                                :class="summaryClampFor(mobileTitleLines[cell.content._id] ?? 1)"
                            >
                                {{ summaryText(cell.content) }}
                            </p>

                            <div
                                v-if="tagsFor(cell.content).length"
                                :data-id="cell.content._id"
                                data-tags-row
                                class="-ml-2 mt-auto flex gap-1 overflow-x-auto pl-2 scrollbar-hide"
                                :style="tagFadeStyle(cell.content._id)"
                                data-test="content-tags"
                                @scroll="(e) => updateTagFade(cell.content._id, e.target as HTMLElement)"
                            >
                                <span
                                    v-for="tag in tagsFor(cell.content)"
                                    :key="tag._id"
                                    class="shrink-0 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400"
                                >
                                    {{ tag.title }}
                                </span>
                            </div>
                        </div>
                    </RouterLink>

                    <div class="hidden sm:block sm:h-full">
                        <ContentCard :content="cell.content" />
                    </div>
                </template>
            </li>
        </ul>

        <!-- Infinite-scroll sentinel: reveals the next batch when it enters the viewport. -->
        <div
            ref="sentinel"
            class="h-px"
            aria-hidden="true"
        ></div>
    </div>
</template>
