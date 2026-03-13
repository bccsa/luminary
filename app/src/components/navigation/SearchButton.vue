<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from "vue";
import { MagnifyingGlassIcon, XMarkIcon, ArrowRightIcon } from "@heroicons/vue/24/outline";
import { useInfiniteScroll } from "@vueuse/core";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";
import { useFtsSearch, db } from "luminary-shared";
import type { ContentDto, FtsSearchResult } from "luminary-shared";

const router = useRouter();

const { isSearchOpen, closeSearch } = useSearchOverlay();

const isOpen = ref(false);
const searchQuery = ref("");
const selectedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);

const languageId = computed(() => appLanguageIdsAsRef.value?.[0]);

// Cast refs to avoid cross-package Vue Ref type mismatch between app and shared
const {
    results: ftsResults,
    isSearching,
    loadMore,
    hasMore,
} = useFtsSearch(searchQuery as any, {
    languageId: languageId as any,
    debounceMs: 150,
    pageSize: 20,
});

const searchResultsContainerRef = ref<HTMLElement | null>(null);
useInfiniteScroll(
    searchResultsContainerRef,
    () => {
        if (hasMore.value && !isSearching.value) loadMore();
    },
    { distance: 10 },
);

// --- Highlight helpers (ported from original search.ts) ---

const MARK_CLASS = "bg-yellow-200 dark:bg-yellow-800 rounded px-0";

function extractPlainTextFromObject(obj: unknown): string {
    if (typeof obj === "string") return obj;
    if (!obj || typeof obj !== "object") return "";
    const node = obj as Record<string, unknown>;
    if (node.text && typeof node.text === "string") return node.text;
    if (Array.isArray(node.content)) {
        const texts = node.content.map((item) => extractPlainTextFromObject(item));
        let result = texts.filter((t) => t).join(" ");
        if (node.type === "paragraph" || node.type === "heading") result += "\n";
        return result;
    }
    return "";
}

function extractPlainText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") {
        try {
            return extractPlainTextFromObject(JSON.parse(content));
        } catch {
            return content;
        }
    }
    return extractPlainTextFromObject(content);
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Highlight query terms in text — phrase match first, then word-boundary matches.
 * Returns HTML-safe string for v-html.
 */
function applyTermHighlights(text: string, query: string): string {
    if (!query?.trim()) return escapeHtml(text);
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    if (!queryTerms.length) return escapeHtml(text);

    const textLower = text.toLowerCase();
    const normalizedPhrase = queryTerms.join(" ");

    // Try exact phrase match first
    const phrasePos = textLower.indexOf(normalizedPhrase);
    if (phrasePos !== -1) {
        const before = text.substring(0, phrasePos);
        const phrase = text.substring(phrasePos, phrasePos + normalizedPhrase.length);
        const after = text.substring(phrasePos + normalizedPhrase.length);
        return (
            escapeHtml(before) +
            `<mark class="${MARK_CLASS}">` +
            escapeHtml(phrase) +
            "</mark>" +
            applyTermHighlights(after, query)
        );
    }

    // Fall back to word-boundary matches for each term.
    // Use Unicode-aware boundaries (lookbehind/lookahead for non-letter chars)
    // so accented characters like é, è, ç are handled correctly.
    const termsInText = queryTerms.filter((t) => textLower.includes(t));
    if (!termsInText.length) return escapeHtml(text);

    const pattern = termsInText.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, "giu");
    let built = "";
    let lastIndex = 0;
    for (const m of text.matchAll(regex)) {
        built +=
            escapeHtml(text.slice(lastIndex, m.index)) +
            `<mark class="${MARK_CLASS}">` +
            escapeHtml(m[0]) +
            "</mark>";
        lastIndex = (m.index ?? 0) + m[0].length;
    }
    built += escapeHtml(text.slice(lastIndex));
    return built;
}

/** Highlight query terms in a title string. Returns HTML safe for v-html. */
function highlightQueryInText(text: string, query: string): string {
    if (!text) return "";
    return applyTermHighlights(text, query);
}

/**
 * Count how many query terms appear in a text string.
 */
function countTermMatches(text: string, queryTerms: string[]): number {
    const lower = text.toLowerCase();
    return queryTerms.filter((t) => lower.includes(t)).length;
}

/**
 * Find the position of the best match cluster in text:
 * tries the full phrase first, then the earliest individual term.
 */
function findBestPosition(text: string, queryTerms: string[]): number {
    const lower = text.toLowerCase();
    // Try exact phrase first
    const phrasePos = lower.indexOf(queryTerms.join(" "));
    if (phrasePos !== -1) return phrasePos;
    // Otherwise find the earliest individual term
    let best = -1;
    for (const term of queryTerms) {
        const pos = lower.indexOf(term);
        if (pos !== -1 && (best === -1 || pos < best)) best = pos;
    }
    return best;
}

/**
 * Extract a highlighted snippet from a ContentDto.
 *
 * Picks the field that contains the most query term matches so that
 * the snippet is always relevant — even when the match is in the body
 * text and the doc also has a summary.
 *
 * Snippet length scales with query length so longer searches get more context.
 */
function createHighlight(doc: ContentDto, query: string): string | undefined {
    if (!query?.trim()) return undefined;

    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    if (!queryTerms.length) return undefined;

    // Wider window for longer queries so the full phrase fits in the excerpt
    const maxLength = Math.min(300, 150 + queryTerms.length * 15);

    const candidates: { text: string; matches: number }[] = [
        { text: extractPlainText(doc.summary), matches: 0 },
        { text: extractPlainText(doc.text), matches: 0 },
        { text: doc.author ?? "", matches: 0 },
        { text: doc.title ?? "", matches: 0 },
    ].map((c) => ({ ...c, matches: countTermMatches(c.text, queryTerms) }));

    // Pick the field with the most term matches; fall back to first non-empty
    const best =
        candidates.find(
            (c) => c.matches === Math.max(...candidates.map((x) => x.matches)) && c.matches > 0,
        ) ?? candidates.find((c) => c.text.length > 0);

    if (!best?.text) return undefined;

    const pos = findBestPosition(best.text, queryTerms);
    const start = Math.max(0, (pos === -1 ? 0 : pos) - Math.floor(maxLength / 3));
    let excerpt = best.text.substring(start, start + maxLength);
    if (start > 0) excerpt = "..." + excerpt;
    if (start + maxLength < best.text.length) excerpt += "...";

    return applyTermHighlights(excerpt, query);
}

// --- Data resolution ---

type EnrichedResult = ContentDto & {
    highlight: string | undefined;
    titleHighlight: string;
    languageName: string;
};

const resolvedDocs = ref<Map<string, ContentDto>>(new Map());
const languageNames = ref<Map<string, string>>(new Map());

watch(
    () => ftsResults.value as FtsSearchResult[],
    async (newResults) => {
        if (!newResults.length) {
            resolvedDocs.value = new Map();
            return;
        }
        const docIds = newResults.map((r) => r.docId);
        const docs = await db.docs.where("_id").anyOf(docIds).toArray();

        const docMap = new Map<string, ContentDto>();
        const langIds = new Set<string>();
        for (const doc of docs) {
            docMap.set(doc._id, doc as ContentDto);
            if ((doc as ContentDto).language) langIds.add((doc as ContentDto).language);
        }
        resolvedDocs.value = docMap;

        if (langIds.size) {
            const langs = await db.docs
                .where("_id")
                .anyOf([...langIds])
                .toArray();
            const langMap = new Map<string, string>();
            for (const lang of langs) {
                const name = (lang as any).name;
                if (name) langMap.set(lang._id, name);
            }
            languageNames.value = langMap;
        }
    },
);

const results = computed<EnrichedResult[]>(() => {
    const query = searchQuery.value;
    return (ftsResults.value as FtsSearchResult[])
        .map((r) => resolvedDocs.value.get(r.docId))
        .filter((doc): doc is ContentDto => !!doc)
        .map((doc) => ({
            ...doc,
            titleHighlight: highlightQueryInText(doc.title, query),
            highlight: createHighlight(doc, query),
            languageName: languageNames.value.get(doc.language) ?? "",
        }));
});

const showResults = computed(() => results.value.length > 0 && !!searchQuery.value.trim());

// --- Overlay state ---

watch(isSearchOpen, (open) => {
    isOpen.value = open;
    if (!open) {
        searchQuery.value = "";
        selectedIndex.value = -1;
    } else {
        nextTick(() => inputRef.value?.focus());
    }
});

watch(results, (newResults) => {
    selectedIndex.value = newResults.length > 0 ? 0 : -1;
});

watch(selectedIndex, (index) => {
    if (index < 0) return;
    nextTick(() => {
        document.getElementById(`search-result-${index}`)?.scrollIntoView({ block: "nearest" });
    });
});

// --- Keyboard handling ---

const handleKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        isOpen.value ? closeSearch() : (isSearchOpen.value = true);
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
    }
    if (showResults.value && results.value.length > 0) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            selectedIndex.value = Math.max(-1, selectedIndex.value - 1);
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (selectedIndex.value >= 0) goToResult(results.value[selectedIndex.value]);
        }
    }
};

const handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
        return;
    }
    if (showResults.value && results.value.length > 0) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            selectedIndex.value = Math.max(-1, selectedIndex.value - 1);
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
        } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (selectedIndex.value >= 0) goToResult(results.value[selectedIndex.value]);
        }
    }
};

const clearSearch = () => {
    searchQuery.value = "";
    inputRef.value?.focus();
};

const goToResult = (result: EnrichedResult) => {
    router.push({ name: "content", params: { slug: result.slug } });
    searchQuery.value = "";
    closeSearch();
};

let handleGlobalKeydown: ((event: KeyboardEvent) => void) | null = null;

onMounted(() => {
    handleGlobalKeydown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "k" && !isOpen.value) {
            event.preventDefault();
            isSearchOpen.value = true;
        } else if (event.key === "Escape" && isOpen.value) {
            event.preventDefault();
            closeSearch();
        }
    };
    document.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
    if (handleGlobalKeydown) document.removeEventListener("keydown", handleGlobalKeydown);
});

defineExpose({ toggleSearch: () => (isSearchOpen.value = !isSearchOpen.value) });
</script>

<template>
    <div class="relative">
        <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
        >
            <div
                v-if="isOpen"
                class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 md:flex-row md:items-start md:justify-center md:bg-black/60 md:px-4 md:pt-24 md:backdrop-blur-sm md:dark:bg-black/60"
                @click.self="closeSearch"
            >
                <!-- Search Modal: full-screen on mobile, centered panel on desktop -->
                <div
                    class="flex h-full w-full flex-col overflow-hidden md:h-auto md:max-h-[75vh] md:max-w-3xl md:rounded-xl md:bg-white md:shadow-2xl md:dark:bg-slate-900"
                    tabindex="-1"
                    @keydown="handleKeydown"
                >
                    <!-- Header -->
                    <div
                        class="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-slate-700 md:p-5"
                    >
                        <MagnifyingGlassIcon
                            class="h-5 w-5 flex-shrink-0 text-zinc-400 md:h-6 md:w-6"
                        />
                        <input
                            ref="inputRef"
                            v-model="searchQuery"
                            type="text"
                            :placeholder="$t('search.placeholder') || 'Search content...'"
                            class="flex-1 bg-transparent text-base text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-slate-100 md:text-lg"
                            autocomplete="off"
                            @keydown="handleInputKeydown"
                        />
                        <div class="flex items-center gap-2">
                            <!-- Clear query button (both mobile and desktop when query exists) -->
                            <button
                                v-if="searchQuery"
                                class="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                :aria-label="$t('search.ariaLabel') || 'Clear'"
                                @click="clearSearch"
                            >
                                <XMarkIcon class="h-5 w-5" />
                            </button>
                            <!-- ESC hint: desktop only -->
                            <kbd
                                class="hidden rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-slate-800 dark:text-slate-400 md:inline-block"
                            >
                                ESC
                            </kbd>
                            <!-- Close button: mobile only, always visible -->
                            <button
                                class="flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 md:hidden"
                                :aria-label="$t('search.close') || 'Close search'"
                                @click="closeSearch"
                            >
                                <XMarkIcon class="h-6 w-6" />
                            </button>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="flex-1 overflow-y-auto">
                        <!-- Loading skeleton -->
                        <div
                            v-if="isSearching"
                            class="p-4 md:p-5"
                        >
                            <div class="space-y-3 md:space-y-4">
                                <div
                                    v-for="i in 3"
                                    :key="i"
                                    class="flex gap-3 md:gap-4"
                                >
                                    <div
                                        class="h-12 w-16 flex-shrink-0 animate-pulse rounded-lg bg-zinc-200 dark:bg-slate-700 md:h-16 md:w-24"
                                    ></div>
                                    <div class="flex-1 space-y-2">
                                        <div
                                            class="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-slate-700 md:h-5"
                                        ></div>
                                        <div
                                            class="h-3 w-full animate-pulse rounded bg-zinc-200 dark:bg-slate-700 md:h-4"
                                        ></div>
                                        <div
                                            class="h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-slate-700 md:h-4"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- No results -->
                        <div
                            v-else-if="searchQuery.trim() && !isSearching && results.length === 0"
                            class="p-8 text-center md:p-10"
                        >
                            <MagnifyingGlassIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600 md:h-14 md:w-14"
                            />
                            <p class="mt-2 text-sm text-zinc-500 dark:text-slate-400 md:text-base">
                                {{ $t("search.noResults") || "No results found" }}
                            </p>
                        </div>

                        <!-- Search Results -->
                        <div
                            v-else-if="showResults"
                            ref="searchResultsContainerRef"
                            id="search-results-container"
                            class="max-h-[60vh] overflow-y-auto py-2 md:max-h-[65vh] md:py-3"
                        >
                            <ul class="divide-y divide-zinc-200 dark:divide-slate-700">
                                <li
                                    v-for="(result, index) in results"
                                    :key="result._id"
                                    :id="`search-result-${index}`"
                                    class="group cursor-pointer px-3 py-2.5 transition-colors first:pt-0 last:pb-2 hover:bg-zinc-50 dark:hover:bg-slate-800/70 md:px-4 md:py-3 md:last:pb-3"
                                    :class="{
                                        'bg-zinc-50 dark:bg-slate-800/70': index === selectedIndex,
                                    }"
                                    @click="goToResult(result)"
                                    @mouseenter="selectedIndex = index"
                                >
                                    <div class="flex min-w-0 gap-2 self-center md:gap-3">
                                        <!-- Thumbnail -->
                                        <div class="flex flex-shrink-0 items-center justify-center">
                                            <LImage
                                                :image="result.parentImageData"
                                                :content-parent-id="result.parentId"
                                                :parent-image-bucket-id="result.parentImageBucketId"
                                                size="small"
                                                aspect-ratio="video"
                                            />
                                        </div>
                                        <!-- Content -->
                                        <div class="min-w-0 flex-1">
                                            <h3
                                                class="truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-slate-100 md:text-base"
                                                :class="{
                                                    'text-amber-600 dark:text-amber-400':
                                                        index === selectedIndex,
                                                }"
                                            >
                                                <span
                                                    v-if="result.titleHighlight"
                                                    v-html="result.titleHighlight"
                                                />
                                                <template v-else>{{ result.title }}</template>
                                            </h3>
                                            <!-- Snippet with highlights when available, else plain summary -->
                                            <p
                                                v-if="result.highlight"
                                                class="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-slate-400 md:mt-1 md:text-sm"
                                                v-html="result.highlight"
                                            ></p>
                                            <p
                                                v-else-if="result.summary"
                                                class="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-slate-400 md:mt-1 md:text-sm"
                                            >
                                                {{ result.summary }}
                                            </p>
                                            <!-- Meta: author · language -->
                                            <div
                                                v-if="result.author || result.languageName"
                                                class="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-slate-500 md:text-xs"
                                            >
                                                <span
                                                    v-if="result.author"
                                                    class="truncate"
                                                    >{{ result.author }}</span
                                                >
                                                <span
                                                    v-if="result.author && result.languageName"
                                                    class="flex-shrink-0 text-zinc-300 dark:text-slate-600"
                                                    aria-hidden="true"
                                                    >·</span
                                                >
                                                <span
                                                    v-if="result.languageName"
                                                    class="flex-shrink-0 uppercase tracking-wide"
                                                    >{{ result.languageName }}</span
                                                >
                                            </div>
                                        </div>
                                        <!-- Arrow -->
                                        <div
                                            class="flex flex-shrink-0 items-center pt-0.5 text-zinc-400 dark:text-slate-500"
                                            :class="{
                                                'text-amber-500 dark:text-amber-400':
                                                    index === selectedIndex,
                                            }"
                                        >
                                            <ArrowRightIcon class="h-4 w-4 md:h-5 md:w-5" />
                                        </div>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div
                        class="hidden items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-800 md:flex md:px-5 md:py-2.5 md:text-sm"
                    >
                        <div class="flex items-center gap-4">
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >↑</kbd
                                >
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >↓</kbd
                                >
                                to navigate
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >↵</kbd
                                >
                                to select
                            </span>
                        </div>
                        <div v-if="showResults">
                            <span
                                >{{ results.length }}
                                {{ results.length === 1 ? "result" : "results" }}</span
                            >
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
