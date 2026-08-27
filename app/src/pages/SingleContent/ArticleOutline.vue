<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, type Ref } from "vue";
import { useEventListener } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { ArrowUturnLeftIcon, CheckCircleIcon, ChevronDownIcon } from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import DropdownMenu from "@/components/common/DropdownMenu.vue";

const props = defineProps<{
    articleRoot: HTMLElement | null;
    scrollContainer: HTMLElement | Window;
    /** Re-scans headings whenever this changes (a translation/article swap). */
    contentId: string | undefined;
    /** Shown in place of the chapter dropdown when the article has no headings. */
    title?: string;
    /** Scroll position, 0-100 — the chapter pill's track. */
    progress?: number;
    /** Saved reading progress, 0-100 — shown by the resume offer and its menu entry. */
    savedProgress?: number;
    /** A saved reading position exists; adds a "continue" entry to the chapter list. */
    resumable?: boolean;
    /** Show the pill as a resume offer instead of the chapter dropdown. */
    offerResume?: boolean;
    /**
     * Title elements the dropdown stands in for: it stays hidden until the visible one has
     * scrolled above the container. Several may be passed when the title is rendered per
     * breakpoint; only the displayed one is measured.
     */
    titleEls?: (HTMLElement | null)[];
}>();

const emit = defineEmits<{
    resume: [];
    dismiss: [];
}>();

const { t } = useI18n();

type OutlineHeading = { id: string; text: string; level: number };

const headings = ref<OutlineHeading[]>([]);
const activeId = ref<string | null>(null);
const titleScrolledOut = ref(false);
const articleScrolledPast = ref(false);
const open = ref(false);

// Provided by BasePage: true once its top-chrome fade is showing, so the pill appears in
// the same moment rather than a few pixels earlier.
const chromeScrolled = inject<Ref<boolean>>("topChromeScrolled", ref(true));

const activeHeading = computed(
    () => headings.value.find((h) => h.id === activeId.value) ?? headings.value[0],
);
// The pill belongs to the article: it takes over from the title and steps aside again once
// the whole body has gone past and the reader is in the related content below. The resume
// offer is the exception — it shows from the start, before any scrolling.
const visible = computed(
    () =>
        props.offerResume ||
        (chromeScrolled.value && titleScrolledOut.value && !articleScrolledPast.value),
);

// Starting to read is an answer to the offer: once the reader scrolls into the article it
// gives way to the chapter dropdown.
watch(chromeScrolled, (scrolled) => {
    if (scrolled && props.offerResume) emit("dismiss");
});

function slugify(text: string, taken: Set<string>) {
    const base =
        text
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") || "section";
    let slug = base;
    let i = 2;
    while (taken.has(slug)) slug = `${base}-${i++}`;
    taken.add(slug);
    return slug;
}

// Headings need a stable id to link/scroll to — CMS-authored HTML rarely carries one, so
// one is generated (and reused if already present) the first time each article is scanned.
function collectHeadings() {
    const root = props.articleRoot;
    if (!root) {
        headings.value = [];
        return;
    }
    const taken = new Set<string>();
    const elements = Array.from(root.querySelectorAll("h2, h3")) as HTMLElement[];
    headings.value = elements.map((el) => {
        if (el.id) taken.add(el.id);
        else el.id = `outline-${slugify(el.textContent ?? "", taken)}`;
        return {
            id: el.id,
            text: el.textContent?.trim() ?? "",
            level: el.tagName === "H3" ? 3 : 2,
        };
    });
}

watch(
    () => [props.articleRoot, props.contentId] as const,
    () => {
        open.value = false;
        nextTick(collectHeadings);
    },
    {
        immediate: true,
    },
);

function containerTop() {
    const container = props.scrollContainer;
    return container === window ? 0 : (container as HTMLElement).getBoundingClientRect().top;
}

// Active heading: the last one that's scrolled past a small offset from the container's
// visible top, rAF-throttled like the other scroll-driven reads in this composable family.
const ACTIVE_OFFSET = 80;

function updateActiveHeading() {
    if (!headings.value.length) return;
    const top = containerTop();

    let current = headings.value[0]?.id ?? null;
    for (const h of headings.value) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - top <= ACTIVE_OFFSET) current = h.id;
        else break;
    }
    activeId.value = current;
}

function updateTitleScrolledOut() {
    const title = props.titleEls?.find((el) => el && el.getClientRects().length > 0);
    if (!title) {
        titleScrolledOut.value = true;
        return;
    }
    titleScrolledOut.value = title.getBoundingClientRect().bottom - containerTop() <= 0;
}

function updateArticleScrolledPast() {
    const root = props.articleRoot;
    articleScrolledPast.value =
        !!root && root.getBoundingClientRect().bottom - containerTop() <= ACTIVE_OFFSET;
}

let rafPending = false;
function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        updateActiveHeading();
        updateTitleScrolledOut();
        updateArticleScrolledPast();
    });
}

useEventListener(() => props.scrollContainer, "scroll", scheduleUpdate, { passive: true });
watch(headings, () =>
    nextTick(() => {
        updateActiveHeading();
        updateTitleScrolledOut();
        updateArticleScrolledPast();
    }),
);
watch(visible, (isVisible) => {
    if (!isVisible) open.value = false;
});

const SCROLL_OFFSET = 96;

function goToHeading(id: string) {
    open.value = false;
    const el = document.getElementById(id);
    if (!el) return;
    const container = props.scrollContainer;

    if (container === window) {
        window.scrollTo({
            top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET,
            behavior: "smooth",
        });
        return;
    }
    const containerEl = container as HTMLElement;
    const top =
        el.getBoundingClientRect().top -
        containerEl.getBoundingClientRect().top +
        containerEl.scrollTop -
        SCROLL_OFFSET;
    containerEl.scrollTo({ top, behavior: "smooth" });
}

function onResume() {
    open.value = false;
    emit("resume");
}
</script>

<template>
    <span
        v-if="visible && offerResume"
        class="relative flex max-w-full items-center rounded-lg bg-zinc-200 shadow-md ring-1 ring-zinc-900/10 backdrop-blur-sm dark:bg-slate-700 dark:ring-white/10"
        data-test="articleOutlineResume"
    >
        <button
            type="button"
            class="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-l-lg pb-2.5 pl-2.5 pr-1 pt-1.5 text-center text-sm text-zinc-800 hover:bg-zinc-300 dark:text-slate-50 dark:hover:bg-slate-600"
            :aria-label="`${t('content.continueReading.action')} · ${savedProgress ?? 0}%`"
            data-test="articleOutlineResumeButton"
            @click="onResume"
        >
            <span class="truncate font-semibold">{{ t("content.continueReading.action") }}</span>
            <span class="tabular-nums text-zinc-500 dark:text-slate-300">
                {{ savedProgress ?? 0 }}%
            </span>
        </button>
        <button
            type="button"
            class="mr-1 flex-shrink-0 cursor-pointer self-start rounded-md p-1.5 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-800 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-50"
            :aria-label="t('content.continueReading.dismiss')"
            data-test="articleOutlineDismiss"
            @click="emit('dismiss')"
        >
            <XMarkIcon class="h-5 w-5" />
        </button>
        <span
            class="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-zinc-300 dark:bg-slate-600"
            aria-hidden="true"
            data-test="articleOutlineProgress"
        >
            <span
                class="block h-full bg-yellow-500 transition-[width] duration-300 dark:bg-yellow-400"
                :style="{ width: `${savedProgress ?? 0}%` }"
            />
        </span>
    </span>
    <span
        v-else-if="visible && !headings.length"
        class="relative flex max-w-full items-center overflow-hidden rounded-lg bg-zinc-200 px-3.5 pb-2.5 pt-1.5 text-sm text-zinc-800 shadow-md ring-1 ring-zinc-900/10 backdrop-blur-sm dark:bg-slate-700 dark:text-slate-50 dark:ring-white/10"
        data-test="articleOutlineTitle"
    >
        <span class="truncate font-medium">{{ title }}</span>
        <span
            v-if="progress !== undefined"
            class="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-zinc-300 dark:bg-slate-600"
            aria-hidden="true"
            data-test="articleOutlineProgress"
        >
            <span
                class="block h-full bg-yellow-500 transition-[width] duration-300 dark:bg-yellow-400"
                :style="{ width: `${progress}%` }"
            />
        </span>
    </span>
    <DropdownMenu
        v-else-if="visible"
        v-model:open="open"
        placement="bottom-center"
        panel-class="max-h-[60vh] w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto py-1"
        class="min-w-0 max-w-full"
        data-test="articleOutline"
    >
        <template #trigger>
            <span
                class="relative flex max-w-full items-center gap-1.5 overflow-hidden rounded-lg bg-zinc-200 px-3.5 pb-2.5 pt-1.5 text-sm text-zinc-800 shadow-md ring-1 ring-zinc-900/10 backdrop-blur-sm hover:bg-zinc-300 dark:bg-slate-700 dark:text-slate-50 dark:ring-white/10 dark:hover:bg-slate-600"
                :aria-label="`Current section: ${activeHeading?.text ?? ''}`"
                data-test="articleOutlineTrigger"
            >
                <!-- Every heading is stacked invisibly in the same grid cell, so the pill is
                     sized to the longest one and stays put as the active chapter changes. -->
                <span class="grid min-w-0 flex-1 text-left font-medium">
                    <span
                        v-for="h in headings"
                        :key="h.id"
                        class="invisible col-start-1 row-start-1 whitespace-nowrap"
                        aria-hidden="true"
                    >
                        {{ h.text }}
                    </span>
                    <span class="col-start-1 row-start-1 truncate">{{ activeHeading?.text }}</span>
                </span>
                <ChevronDownIcon
                    class="h-4 w-4 flex-shrink-0 transition-transform"
                    :class="{ 'rotate-180': open }"
                    aria-hidden="true"
                />
                <span
                    v-if="progress !== undefined"
                    class="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-zinc-300 dark:bg-slate-600"
                    aria-hidden="true"
                    data-test="articleOutlineProgress"
                >
                    <span
                        class="block h-full bg-yellow-500 transition-[width] duration-300 dark:bg-yellow-400"
                        :style="{ width: `${progress}%` }"
                    />
                </span>
            </span>
        </template>
        <button
            v-if="resumable"
            type="button"
            role="menuitem"
            class="mb-1 flex w-full cursor-pointer select-none items-center gap-2 border-b border-zinc-900/10 py-2 pl-4 pr-3 text-left text-sm font-medium leading-5 text-yellow-600 hover:bg-zinc-50 dark:border-white/10 dark:text-yellow-400 dark:hover:bg-slate-600"
            data-test="articleOutlineResumeOption"
            @click="onResume"
        >
            <ArrowUturnLeftIcon
                class="h-4 w-4 flex-shrink-0"
                aria-hidden="true"
            />
            <span class="flex-1">{{ t("content.continueReading.action") }}</span>
            <span class="font-normal tabular-nums text-zinc-500 dark:text-slate-300">
                {{ savedProgress ?? 0 }}%
            </span>
        </button>
        <button
            v-for="h in headings"
            :key="h.id"
            type="button"
            role="menuitem"
            class="flex w-full cursor-pointer select-none items-center gap-2 py-2 pr-3 text-left text-sm leading-5 hover:bg-zinc-50 dark:hover:bg-slate-600"
            :class="[
                h.level === 3 ? 'pl-8' : 'pl-4',
                activeId === h.id
                    ? 'font-medium text-yellow-600 dark:text-yellow-400'
                    : 'text-zinc-800 dark:text-white',
            ]"
            data-test="articleOutlineOption"
            @click="goToHeading(h.id)"
        >
            <span class="flex-1">{{ h.text }}</span>
            <CheckCircleIcon
                v-if="activeId === h.id"
                class="h-5 w-5 flex-shrink-0 text-yellow-500"
                aria-hidden="true"
            />
        </button>
    </DropdownMenu>
</template>
