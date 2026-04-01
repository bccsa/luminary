<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from "vue";
import { MagnifyingGlassIcon, XMarkIcon, ArrowRightIcon } from "@heroicons/vue/24/outline";
import { ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";
import { useInfiniteScroll } from "@vueuse/core";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { appLanguageIdsAsRef, isMac, isMdScreen } from "@/globalConfig";
import { useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";
import { useFtsSearch, db, stripHtml } from "luminary-shared";
import type { ContentDto, FtsSearchResult } from "luminary-shared";
import { useI18n } from "vue-i18n";

const router = useRouter();
const { t } = useI18n();

const { isSearchOpen, closeSearch } = useSearchOverlay();

const isOpen = ref(false);
const selectedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const focusOnNextOpen = ref(false);
const isInputFocused = ref(false);

const languageId = computed(() => appLanguageIdsAsRef.value?.[0]);

// Lock the mode when the overlay opens to avoid flicker if `window.innerWidth`
// changes while typing (e.g. mobile on-screen keyboard).
const isManualSearchMode = ref(isMdScreen.value);

const shortcutLabel = computed(() => (isMac.value ? "Cmd+K" : "Ctrl+K"));

const RECENT_SEARCHES_KEY = "luminary-search-recent";
const RECENT_SEARCHES_MAX = 10;
const CURRENT_SEARCH_QUERY_KEY = "luminary-search-current-query";
const LAST_EXECUTED_SEARCH_QUERY_KEY = "luminary-search-last-executed-query";

function getStorage(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

function loadFromStorage(key: string): string {
    return getStorage()?.getItem(key) ?? "";
}

function saveToStorage(key: string, value: string | null): void {
    try {
        if (value === null) getStorage()?.removeItem(key);
        else getStorage()?.setItem(key, value);
    } catch {
        /* ignore */
    }
}

function persistLastExecutedQuery(q: string) {
    const trimmed = q.trim();
    if (trimmed.length >= 3) saveToStorage(LAST_EXECUTED_SEARCH_QUERY_KEY, trimmed);
}

function loadRecentSearches(): string[] {
    try {
        const raw = getStorage()?.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, RECENT_SEARCHES_MAX) : [];
    } catch {
        return [];
    }
}

const searchQuery = ref(
    loadFromStorage(LAST_EXECUTED_SEARCH_QUERY_KEY) || loadFromStorage(CURRENT_SEARCH_QUERY_KEY),
);
const recentSearches = ref<string[]>(loadRecentSearches());

function pushRecentSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;

    const next = [trimmed, ...recentSearches.value.filter((t) => t !== trimmed)].slice(
        0,
        RECENT_SEARCHES_MAX,
    );
    recentSearches.value = next;
    saveToStorage(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

function pickRecentSearch(term: string) {
    searchQuery.value = term;
    persistLastExecutedQuery(term);
    runSearch();
    // Clicking a recent-search chip moves focus to the button.
    // Bring focus back to the input and select the query so arrow keys work within the modal.
    nextTick(() => {
        const el = inputRef.value;
        if (!el) return;
        el.focus({ preventScroll: true });
        try {
            el.setSelectionRange(0, el.value.length);
        } catch {
            el.select();
        }
    });
}

const ftsRet = useFtsSearch(
    searchQuery as any,
    {
        languageId: languageId as any,
        debounceMs: computed(() => (isManualSearchMode.value ? "manual" : 250)) as any,
        pageSize: 40,
    } as any,
) as ReturnType<typeof useFtsSearch> & {
    lastSearchedQuery: import("vue").Ref<string>;
    runSearch: () => void;
};
const {
    results: ftsResults,
    isSearching,
    loadMore,
    hasMore,
    lastSearchedQuery,
    runSearch,
} = ftsRet;

const searchResultsContainerRef = ref<HTMLElement | null>(null);
useInfiniteScroll(
    searchResultsContainerRef,
    () => {
        if (hasMore.value && !isSearching.value) loadMore();
    },
    { distance: 150 },
);

const MARK_CLASS = "bg-amber-200 dark:bg-yellow-500 rounded px-0";

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
            return stripHtml(content);
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

function applyTermHighlights(text: string, query: string): string {
    if (!query?.trim()) return escapeHtml(text);
    const queryTermsAll = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    if (!queryTermsAll.length) return escapeHtml(text);

    // Trigram search ignores words shorter than 3 letters. For consistency, only highlight
    // <3-letter words when we can highlight the full phrase (handled below).
    const queryTerms = queryTermsAll.filter((t) => t.length >= 3);

    const textLower = text.toLowerCase();
    const normalizedPhrase = queryTermsAll.join(" ");

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

    // Use Unicode-aware boundaries so accented characters like é, è, ç are handled correctly.
    if (!queryTerms.length) return escapeHtml(text);
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

function countTermMatches(text: string, queryTerms: string[]): number {
    const lower = text.toLowerCase();
    return queryTerms.filter((t) => lower.includes(t)).length;
}

function findBestPosition(text: string, queryTerms: string[]): number {
    const lower = text.toLowerCase();
    const phrasePos = lower.indexOf(queryTerms.join(" "));
    if (phrasePos !== -1) return phrasePos;
    let best = -1;
    for (const term of queryTerms) {
        const pos = lower.indexOf(term);
        if (pos !== -1 && (best === -1 || pos < best)) best = pos;
    }
    return best;
}

function createHighlight(doc: ContentDto, query: string): string | undefined {
    if (!query?.trim()) return undefined;

    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    if (!queryTerms.length) return undefined;

    // Wider window for longer queries so the full phrase fits in the excerpt.
    const maxLength = Math.min(300, 150 + queryTerms.length * 15);

    const candidates: { text: string; matches: number }[] = [
        { text: extractPlainText(doc.summary), matches: 0 },
        { text: extractPlainText(doc.text), matches: 0 },
    ].map((c) => ({ ...c, matches: countTermMatches(c.text, queryTerms) }));

    const best =
        candidates.find(
            (c) => c.matches === Math.max(...candidates.map((x) => x.matches)) && c.matches > 0,
        ) ?? candidates.find((c) => c.text.length > 0);

    if (!best?.text) return undefined;

    const pos = findBestPosition(best.text, queryTerms);
    const start = Math.max(0, (pos === -1 ? 0 : pos) - Math.floor(maxLength / 3));
    const excerpt = best.text.substring(start, start + maxLength);

    return applyTermHighlights(excerpt, query);
}

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

const trimmedQuery = computed(() => searchQuery.value.trim());

const highlightQuery = computed(() => {
    const q = trimmedQuery.value;
    if (!isManualSearchMode.value) return q;
    // Manual mode: only highlight the last executed query, not the in-progress edits.
    return lastSearchedQuery.value === q ? q : lastSearchedQuery.value;
});

const results = computed<EnrichedResult[]>(() => {
    const query = highlightQuery.value;
    return (ftsResults.value as FtsSearchResult[])
        .map((r) => resolvedDocs.value.get(r.docId))
        .filter((doc): doc is ContentDto => !!doc)
        .map((doc) => ({
            ...doc,
            titleHighlight: applyTermHighlights(stripHtml(doc.title ?? ""), query),
            highlight: createHighlight(doc, query),
            languageName: languageNames.value.get(doc.language) ?? "",
        }));
});
const showResults = computed(() => results.value.length > 0);

/** User has run search for current query and got nothing */
const showNoResults = computed(
    () =>
        trimmedQuery.value.length >= 3 &&
        lastSearchedQuery.value === trimmedQuery.value &&
        !isSearching.value &&
        results.value.length === 0,
);

/** Query has 1–2 characters: we need at least 3 for FTS */
const showMinCharsHint = computed(
    () => !isSearching.value && trimmedQuery.value.length > 0 && trimmedQuery.value.length < 3,
);

/** Overlay is open with no query yet */
const showEmptyStateHint = computed(() => isOpen.value && !trimmedQuery.value);

/** User has typed 3+ chars but not pressed Go yet */
const showPressGoHint = computed(
    () =>
        isManualSearchMode.value &&
        trimmedQuery.value.length >= 3 &&
        lastSearchedQuery.value !== trimmedQuery.value &&
        !isSearching.value &&
        results.value.length === 0,
);

/** Hide once the current query has been searched; reappear when query changes */
const showGoButton = computed(
    () =>
        isManualSearchMode.value &&
        trimmedQuery.value.length >= 3 &&
        lastSearchedQuery.value !== trimmedQuery.value,
);

watch(
    () => searchQuery.value,
    (newQuery, oldQuery) => {
        const trimmed = newQuery.trim();
        // Editing the query should cancel any selected result so Enter applies the search.
        if (newQuery !== oldQuery) selectedIndex.value = -1;
        if (trimmed) {
            saveToStorage(CURRENT_SEARCH_QUERY_KEY, trimmed);
        } else {
            saveToStorage(CURRENT_SEARCH_QUERY_KEY, null);
            // Clearing the input should also clear the last executed query,
            // so reopening doesn't restore a previous search.
            saveToStorage(LAST_EXECUTED_SEARCH_QUERY_KEY, null);
            ftsResults.value = [];
            resolvedDocs.value = new Map();
            lastSearchedQuery.value = "";
            selectedIndex.value = -1;
        }
    },
);

watch(lastSearchedQuery, (q) => {
    if (q) persistLastExecutedQuery(q);
});

watch(isSearchOpen, (open) => {
    isOpen.value = open;
    if (!open) {
        selectedIndex.value = -1;
        return;
    }

    isManualSearchMode.value = isMdScreen.value;

    const persistedQuery =
        loadFromStorage(LAST_EXECUTED_SEARCH_QUERY_KEY) ||
        loadFromStorage(CURRENT_SEARCH_QUERY_KEY);
    if (persistedQuery !== searchQuery.value.trim()) {
        searchQuery.value = persistedQuery;
    }

    // Mobile manual mode: reset so the user explicitly re-runs the search.
    // Desktop live mode: keep existing results so navigating away/back doesn't blank the UI.
    if (isManualSearchMode.value) {
        const q = searchQuery.value.trim();
        // Only clear results when they don't match the query we're about to show.
        // This keeps results in memory when reopening the modal for the same term.
        if (!q || lastSearchedQuery.value !== q) {
            ftsResults.value = [];
            resolvedDocs.value = new Map();
            lastSearchedQuery.value = "";
        }
    }
    selectedIndex.value = -1;
    nextTick(() => {
        const hasQuery = !!searchQuery.value.trim();
        const shouldSelectAll = focusOnNextOpen.value || hasQuery;
        const shouldFocus = isManualSearchMode.value
            ? focusOnNextOpen.value || !trimmedQuery.value
            : true;
        focusOnNextOpen.value = false;
        if (shouldFocus) {
            const el = inputRef.value;
            el?.focus({ preventScroll: true });

            // Opening with an existing query should allow immediate typing to replace it.
            // Defer selection to avoid fighting with focus/transition timing across browsers.
            if (shouldSelectAll && el) {
                const len = el.value.length;
                requestAnimationFrame(() => {
                    try {
                        el.setSelectionRange(0, len);
                    } catch {
                        // Some input types/browsers can throw; fall back to select().
                        el.select();
                    }
                });
            }
        }

        const q = searchQuery.value.trim();
        if (q.length >= 3) {
            if (isManualSearchMode.value) {
                // Manual mode only: keep the UI/results, but don't re-run the same query on reopen.
                if (lastSearchedQuery.value !== q) runSearch();
            } else {
                // Live mode: avoid re-searching on reopen if we already have results.
                if ((ftsResults.value as any)?.length === 0) runSearch();
            }
        }
    });
}, { immediate: true });

watch(results, (newResults) => {
    if (newResults.length === 0) {
        selectedIndex.value = -1;
    }
    // Do not auto-select results; selection should only happen when the user navigates.
});

watch(selectedIndex, (index) => {
    if (index < 0) return;
    nextTick(() => {
        document.getElementById(`search-result-${index}`)?.scrollIntoView({ block: "nearest" });
    });
});

const handleKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (isOpen.value) closeSearch();
        else {
            focusOnNextOpen.value = true;
            isSearchOpen.value = true;
        }
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
    }
    if (results.value.length > 0) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (selectedIndex.value <= 0) selectedIndex.value = results.value.length - 1;
            else selectedIndex.value = selectedIndex.value - 1;
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (selectedIndex.value < 0) selectedIndex.value = 0;
            else selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (selectedIndex.value >= 0) goToResult(results.value[selectedIndex.value]);
        }
    }
};

function handleModalKeydownCapture(event: KeyboardEvent) {
    if (!isOpen.value) return;
    // Contain navigation keys within the modal even when focus isn't on the input.
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        // Reuse the existing modal handler logic for navigation.
        handleKeydown(event);
    }
}

const handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSearch();
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const q = searchQuery.value.trim();
        const isNewQuery = q && q !== lastSearchedQuery.value;

        // Enter should apply the current query if it hasn't been searched yet.
        if (q.length >= 3 && isNewQuery) {
            pushRecentSearch(q);
            persistLastExecutedQuery(q);
            runSearch();
            if (isManualSearchMode.value) inputRef.value?.blur();
            return;
        }

        if (results.value.length > 0 && selectedIndex.value >= 0) {
            goToResult(results.value[selectedIndex.value]);
        } else {
            if (!isManualSearchMode.value) return;
            if (q.length < 3) return;
            pushRecentSearch(q);
            persistLastExecutedQuery(q);
            runSearch();
            inputRef.value?.blur();
        }
        return;
    }
    if (results.value.length > 0) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            if (selectedIndex.value <= 0) selectedIndex.value = results.value.length - 1;
            else selectedIndex.value = selectedIndex.value - 1;
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            if (selectedIndex.value < 0) selectedIndex.value = 0;
            else selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
        }
    }
};

const clearSearch = () => {
    searchQuery.value = "";
    inputRef.value?.focus();
};

function onGoClick() {
    const q = searchQuery.value.trim();
    if (q.length < 3) return;
    pushRecentSearch(q);
    persistLastExecutedQuery(q);
    runSearch();
    if (isManualSearchMode.value) inputRef.value?.blur();
}

const goToResult = (result: EnrichedResult) => {
    const q = lastSearchedQuery.value || trimmedQuery.value;
    if (q) pushRecentSearch(q);
    router.push({ name: "content", params: { slug: result.slug } });
    closeSearch();
};

let handleGlobalKeydown: ((event: KeyboardEvent) => void) | null = null;

onMounted(() => {
    handleGlobalKeydown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "k" && !isOpen.value) {
            event.preventDefault();
            focusOnNextOpen.value = true;
            isSearchOpen.value = true;
        } else if (event.key === "Escape" && isOpen.value) {
            event.preventDefault();
            closeSearch();
        }
    };
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("keydown", handleModalKeydownCapture, true);
});

onUnmounted(() => {
    if (handleGlobalKeydown) document.removeEventListener("keydown", handleGlobalKeydown);
    document.removeEventListener("keydown", handleModalKeydownCapture, true);
});

defineExpose({ toggleSearch: () => (isSearchOpen.value = !isSearchOpen.value) });
</script>

<template>
    <div class="relative">
        <Transition
            enter-active-class="md:transition-opacity md:duration-200"
            enter-from-class="md:opacity-0"
            enter-to-class="md:opacity-100"
            leave-active-class="md:transition-opacity md:duration-150"
            leave-from-class="md:opacity-100"
            leave-to-class="md:opacity-0"
        >
            <div
                v-show="isOpen"
                class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 md:flex-row md:items-start md:justify-center md:bg-black/60 md:px-4 md:pt-24 md:backdrop-blur-sm md:dark:bg-black/60"
                @click.self="closeSearch"
            >
                <div
                    class="flex h-full w-full flex-col overflow-hidden md:h-auto md:max-h-[75vh] md:max-w-3xl md:rounded-xl md:bg-white md:shadow-2xl md:dark:bg-slate-900"
                    tabindex="-1"
                    @keydown="handleKeydown"
                >
                    <div
                        class="flex items-center gap-3 border-b border-zinc-200 px-3 py-4 dark:border-slate-700 md:p-4"
                    >
                        <MagnifyingGlassIcon
                            class="h-5 w-5 flex-shrink-0 text-zinc-400 md:h-6 md:w-6"
                        />
                        <input
                            ref="inputRef"
                            v-model="searchQuery"
                            type="text"
                            role="combobox"
                            aria-haspopup="listbox"
                            :aria-expanded="showResults"
                            :aria-activedescendant="
                                selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined
                            "
                            :placeholder="t('search.placeholder')"
                            class="flex-1 bg-transparent text-base text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-slate-100 md:text-lg"
                            autocomplete="off"
                            @keydown="handleInputKeydown"
                            @focus="isInputFocused = true"
                            @blur="isInputFocused = false"
                        />
                        <div class="flex h-9 flex-shrink-0 items-center gap-1.5 pr-1 md:gap-2 md:pr-0">
                            <button
                                v-if="showGoButton"
                                type="button"
                                class="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 md:h-auto md:py-1.5"
                                @mousedown.prevent
                                @click="onGoClick"
                            >
                                {{ t("search.go") }}
                            </button>
                            <button
                                v-if="searchQuery"
                                class="flex h-9 w-9 items-center justify-center rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                :aria-label="t('search.clearQuery')"
                                @mousedown.prevent
                                @click="clearSearch"
                            >
                                <ArrowUturnLeftIcon class="h-5 w-5" />
                            </button>
                            <button
                                v-if="!isInputFocused"
                                class="flex h-9 w-9 items-center justify-center rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                :aria-label="t('search.close')"
                                @click="closeSearch"
                            >
                                <XMarkIcon class="h-5 w-5 md:h-5 md:w-5" />
                            </button>
                        </div>
                    </div>

                    <div
                        ref="searchResultsContainerRef"
                        class="flex-1 overflow-y-auto scrollbar-hide"
                    >
                        <div
                            v-if="isSearching && results.length === 0"
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

                        <div
                            v-else-if="showMinCharsHint"
                            class="p-8 text-center md:p-10"
                        >
                            <p class="text-sm text-zinc-500 dark:text-slate-400 md:text-base">
                                {{ t("search.minChars") }}
                            </p>
                        </div>

                        <div
                            v-else-if="showPressGoHint"
                            class="p-8 text-center md:p-10"
                        >
                            <p class="text-sm text-zinc-500 dark:text-slate-400 md:text-base">
                                {{ t("search.pressGo") }}
                            </p>
                        </div>

                        <div
                            v-else-if="showNoResults"
                            class="p-8 text-center md:p-10"
                        >
                            <MagnifyingGlassIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600 md:h-14 md:w-14"
                            />
                            <p class="mt-2 text-sm text-zinc-500 dark:text-slate-400 md:text-base">
                                {{ t("search.noResults") }}
                            </p>
                            <p class="mt-1 text-xs text-zinc-400 dark:text-slate-500">
                                {{ t("search.tryDifferent") }}
                            </p>
                        </div>

                        <div
                            v-else-if="showResults"
                            id="search-results-container"
                            class="py-2 pb-24 md:py-3 md:pb-3"
                        >
                            <ul
                                role="listbox"
                                :aria-label="t('search.ariaLabel')"
                                class="divide-y divide-zinc-200 dark:divide-slate-700"
                            >
                                <li
                                    v-for="(result, index) in results"
                                    :key="result._id"
                                    :id="`search-result-${index}`"
                                    role="option"
                                    :aria-selected="index === selectedIndex"
                                    class="group cursor-pointer px-3 py-2.5 transition-colors first:pt-0 last:pb-2 hover:bg-zinc-50 dark:hover:bg-slate-800/70 md:px-4 md:py-3 md:last:pb-3"
                                    :class="{
                                        'bg-zinc-50 dark:bg-slate-800/70': index === selectedIndex,
                                    }"
                                    @click="goToResult(result)"
                                    @mouseenter="selectedIndex = index"
                                >
                                    <div class="flex min-w-0 gap-2 self-center md:gap-3">
                                        <div class="flex flex-shrink-0 items-center justify-center">
                                            <LImage
                                                :image="result.parentImageData"
                                                :content-parent-id="result.parentId"
                                                :parent-image-bucket-id="result.parentImageBucketId"
                                                size="small"
                                                aspect-ratio="video"
                                            />
                                        </div>
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
                                                <template v-else>{{
                                                    stripHtml(result.title ?? "")
                                                }}</template>
                                            </h3>
                                            <p
                                                v-if="result.highlight"
                                                class="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-slate-400 md:mt-1 md:text-sm"
                                                v-html="result.highlight"
                                            ></p>
                                            <p
                                                v-else-if="result.summary"
                                                class="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-slate-400 md:mt-1 md:text-sm"
                                            >
                                                {{ stripHtml(result.summary) }}
                                            </p>
                                            <!-- hide language when same as user's to avoid "English" on every card -->
                                            <div
                                                v-if="
                                                    result.author ||
                                                    (result.languageName &&
                                                        result.language !== languageId)
                                                "
                                                class="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-slate-500 md:text-xs"
                                            >
                                                <span
                                                    v-if="result.author"
                                                    class="truncate"
                                                    >{{ result.author }}</span
                                                >
                                                <span
                                                    v-if="
                                                        result.author &&
                                                        result.languageName &&
                                                        result.language !== languageId
                                                    "
                                                    class="flex-shrink-0 text-zinc-300 dark:text-slate-600"
                                                    aria-hidden="true"
                                                    >·</span
                                                >
                                                <span
                                                    v-if="
                                                        result.languageName &&
                                                        result.language !== languageId
                                                    "
                                                    class="flex-shrink-0 uppercase tracking-wide"
                                                    >{{ result.languageName }}</span
                                                >
                                            </div>
                                        </div>
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
                            <div
                                v-if="isSearching && results.length > 0"
                                class="flex justify-center py-3"
                            >
                                <svg
                                    class="h-5 w-5 animate-spin text-zinc-400 dark:text-slate-500"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    />
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                    />
                                </svg>
                            </div>
                        </div>

                        <div
                            v-else-if="showEmptyStateHint"
                            class="p-6 md:p-8"
                        >
                            <p
                                class="text-center text-sm text-zinc-500 dark:text-slate-400 md:text-base"
                            >
                                {{ t("search.hint") }}
                            </p>
                            <p class="mt-1 text-center text-xs text-zinc-400 dark:text-slate-500">
                                {{ t("search.minCharsShort") }}
                                <span class="hidden sm:inline">
                                    · {{ t("search.shortcut", { shortcut: shortcutLabel }) }}
                                </span>
                            </p>
                            <div
                                v-if="recentSearches.length > 0"
                                class="mt-4 border-t border-zinc-200 pt-4 dark:border-slate-700"
                            >
                                <p
                                    class="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-slate-500"
                                >
                                    {{ t("search.recent") }}
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    <button
                                        v-for="term in recentSearches"
                                        :key="term"
                                        type="button"
                                        class="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                                        @click="pickRecentSearch(term)"
                                    >
                                        {{ term }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        class="hidden items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-800 md:flex md:px-5 md:py-2.5 md:text-sm"
                    >
                        <div class="flex items-center gap-4">
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >ESC</kbd
                                >
                                {{ t("search.toClose") }}
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >↑</kbd
                                >
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >↓</kbd
                                >
                                {{ t("search.navigate") }}
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd
                                    class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                                    >↵</kbd
                                >
                                {{ t("search.select") }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
