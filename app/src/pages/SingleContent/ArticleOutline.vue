<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import { CheckCircleIcon, ChevronDownIcon } from "@heroicons/vue/24/outline";
import DropdownMenu from "@/components/common/DropdownMenu.vue";

const props = defineProps<{
    articleRoot: HTMLElement | null;
    scrollContainer: HTMLElement | Window;
    /** Re-scans headings whenever this changes (a translation/article swap). */
    contentId: string | undefined;
    /** Shown in place of the chapter dropdown when the article has no headings. */
    title?: string;
    /**
     * Title elements the dropdown stands in for: it stays hidden until the visible one has
     * scrolled above the container. Several may be passed when the title is rendered per
     * breakpoint; only the displayed one is measured.
     */
    titleEls?: (HTMLElement | null)[];
}>();

type OutlineHeading = { id: string; text: string; level: number };

const headings = ref<OutlineHeading[]>([]);
const activeId = ref<string | null>(null);
const titleScrolledOut = ref(false);
const open = ref(false);

const activeHeading = computed(
    () => headings.value.find((h) => h.id === activeId.value) ?? headings.value[0],
);
const visible = computed(() => titleScrolledOut.value);

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

let rafPending = false;
function scheduleUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        updateActiveHeading();
        updateTitleScrolledOut();
    });
}

useEventListener(() => props.scrollContainer, "scroll", scheduleUpdate, { passive: true });
watch(headings, () =>
    nextTick(() => {
        updateActiveHeading();
        updateTitleScrolledOut();
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
</script>

<template>
    <span
        v-if="visible && !headings.length"
        class="flex max-w-full items-center rounded-full bg-zinc-200 px-3.5 py-1.5 text-sm text-zinc-800 shadow-md ring-1 ring-zinc-900/10 backdrop-blur-sm dark:bg-slate-700 dark:text-slate-50 dark:ring-white/10"
        data-test="articleOutlineTitle"
    >
        <span class="truncate font-medium">{{ title }}</span>
    </span>
    <DropdownMenu
        v-else-if="visible"
        v-model:open="open"
        placement="bottom-start"
        panel-class="max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto py-1"
        class="min-w-0 max-w-full"
        data-test="articleOutline"
    >
        <template #trigger>
            <span
                class="flex max-w-full items-center gap-1.5 rounded-full bg-zinc-200 px-3.5 py-1.5 text-sm text-zinc-800 shadow-md ring-1 ring-zinc-900/10 backdrop-blur-sm hover:bg-zinc-300 dark:bg-slate-700 dark:text-slate-50 dark:ring-white/10 dark:hover:bg-slate-600"
                :aria-label="`Current section: ${activeHeading?.text ?? ''}`"
                data-test="articleOutlineTrigger"
            >
                <span class="truncate font-medium">{{ activeHeading?.text }}</span>
                <ChevronDownIcon
                    class="h-4 w-4 flex-shrink-0 transition-transform"
                    :class="{ 'rotate-180': open }"
                    aria-hidden="true"
                />
            </span>
        </template>
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
