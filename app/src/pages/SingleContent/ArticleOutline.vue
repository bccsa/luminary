<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useEventListener } from "@vueuse/core";

const props = defineProps<{
    articleRoot: HTMLElement | null;
    scrollContainer: HTMLElement | Window;
    /** Reading progress, 0-100 — drawn as a fill on the rail behind the heading list. */
    progress: number;
    /** Re-scans headings whenever this changes (a translation/article swap). */
    contentId: string | undefined;
}>();

type OutlineHeading = { id: string; text: string; level: number };

const headings = ref<OutlineHeading[]>([]);
const activeId = ref<string | null>(null);

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
    () => nextTick(collectHeadings),
    {
        immediate: true,
    },
);

// Active heading: the last one that's scrolled past a small offset from the container's
// visible top, rAF-throttled like the other scroll-driven reads in this composable family.
const ACTIVE_OFFSET = 80;

function updateActiveHeading() {
    if (!headings.value.length) return;
    const container = props.scrollContainer;
    const containerTop =
        container === window ? 0 : (container as HTMLElement).getBoundingClientRect().top;

    let current = headings.value[0]?.id ?? null;
    for (const h of headings.value) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - containerTop <= ACTIVE_OFFSET) current = h.id;
        else break;
    }
    activeId.value = current;
}

let rafPending = false;
function scheduleActiveUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        updateActiveHeading();
    });
}

useEventListener(() => props.scrollContainer, "scroll", scheduleActiveUpdate, { passive: true });
watch(headings, () => nextTick(updateActiveHeading));

const SCROLL_OFFSET = 96;

function goToHeading(id: string) {
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
    <nav
        v-if="headings.length > 1"
        class="sticky top-1/2 mx-auto hidden max-h-[70vh] w-full max-w-52 -translate-y-1/2 xl:block"
        aria-label="Article sections"
    >
        <ol class="relative max-h-[70vh] overflow-y-auto pl-3 scrollbar-hide">
            <div class="absolute inset-y-0 left-0 w-px bg-zinc-200 dark:bg-slate-700">
                <div
                    class="w-full bg-yellow-500 transition-[height] duration-150 ease-out dark:bg-yellow-400"
                    :style="{ height: `${progress}%` }"
                />
            </div>
            <li
                v-for="h in headings"
                :key="h.id"
                :class="{ 'ml-3': h.level === 3 }"
            >
                <button
                    type="button"
                    class="block w-full truncate py-1 text-left text-xs leading-snug transition-colors"
                    :class="
                        activeId === h.id
                            ? 'font-medium text-yellow-600 dark:text-yellow-400'
                            : 'text-zinc-500 hover:text-zinc-800 dark:text-slate-400 dark:hover:text-slate-100'
                    "
                    @click="goToHeading(h.id)"
                >
                    {{ h.text }}
                </button>
            </li>
        </ol>
    </nav>
</template>
