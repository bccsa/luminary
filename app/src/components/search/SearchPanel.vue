<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, inject, nextTick } from "vue";
import { MagnifyingGlassIcon, XMarkIcon, ArrowRightIcon } from "@heroicons/vue/24/outline";
import { ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";
import { useInfiniteScroll } from "@vueuse/core";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { appLanguageIdsAsRef, cmsLanguages, isMac, isMobileScreen } from "@/globalConfig";
import { useRoute, useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";
import { useFtsSearch, stripHtml } from "luminary-shared";
import type { ContentDto, FtsSearchResult } from "luminary-shared";
import { useI18n } from "vue-i18n";

/**
 * The shared search surface, embedded two ways:
 *  - `mode="modal"`: inside the desktop SearchModal overlay (internal state, closes via the
 *    global search overlay, no URL coupling).
 *  - `mode="page"`: inside the dedicated /search route page (syncs `q` to the URL so the page
 *    is shareable and back/forward works; the JSON-LD SearchAction targets this URL).
 */
const props = withDefaults(defineProps<{ mode?: "modal" | "page" }>(), { mode: "modal" });

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const { isSearchOpen, closeSearch } = useSearchOverlay();

const isPage = computed(() => props.mode === "page");

const isOpen = computed(() => (isPage.value ? true : isSearchOpen.value));

const selectedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const focusOnNextOpen = ref(false);
const isInputFocused = ref(false);

const languageId = computed(() => appLanguageIdsAsRef.value?.[0]);

// Mobile-only layout differences (focus/select-all on open, blur-after-search to dismiss the
// on-screen keyboard). Search itself is trigger-only (Enter/Go) on every device — see
// `debounceMs: "manual"` below.
// Same breakpoint as MobileMenu (`lg` / isMobileScreen). Keep in sync with viewport width so
// this never sticks after resize to desktop; keyboards rarely change innerWidth.
const isMobileLayout = computed(() => isMobileScreen.value);

const shortcutLabel = computed(() => (isMac.value ? "Cmd+K" : "Ctrl+K"));

/** Wide screens only: hide the header X while the input is focused. Below lg (mobile menu), focus/blur is unreliable, so always show close. */
const showHeaderCloseButton = computed(() => isMobileLayout.value || !isInputFocused.value);

const RECENT_SEARCHES_KEY = "luminary-search-recent";
const RECENT_SEARCHES_MAX = 10;

function getRecentSearchesLocalStorage(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

function loadRecentSearches(): string[] {
    try {
        const raw = getRecentSearchesLocalStorage()?.getItem(RECENT_SEARCHES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, RECENT_SEARCHES_MAX) : [];
    } catch {
        return [];
    }
}

const searchQuery = ref("");
const recentSearches = ref<string[]>(loadRecentSearches());

function pushRecentSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;

    const next = [trimmed, ...recentSearches.value.filter((t) => t !== trimmed)].slice(
        0,
        RECENT_SEARCHES_MAX,
    );
    recentSearches.value = next;
    try {
        getRecentSearchesLocalStorage()?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
}

function pickRecentSearch(term: string) {
    searchQuery.value = term;
    runSearch();
    // Desktop only: refocus the input and select the term so the user can immediately
    // retype to refine. Skipped on mobile because it would pop the soft keyboard.
    if (!isMobileScreen.value) {
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
}

const ftsRet = useFtsSearch(searchQuery as any, {
    languageId: languageId as any,
    // Trigger-only: search runs on Enter/Go/recent-search-pick, never on a keystroke debounce.
    debounceMs: "manual",
    pageSize: 40,
});
const {
    results: ftsResults,
    isSearching,
    loadMore,
    hasMore,
    lastSearchedQuery,
    runSearch,
    reset: resetSearch,
    isPartial,
} = ftsRet;

// Show the "offline / partial results" hint only once a search has produced output.
const showPartialHint = computed(
    () => isPartial.value && !isSearching.value && ftsResults.value.length > 0,
);

const searchResultsContainerRef = ref<HTMLElement | null>(null);

// In page mode the results flow in BasePage's scrolling <main> (provided below), so infinite
// scroll watches that; in modal mode the results scroll inside the overlay's own container.
const mainScrollEl = inject<import("vue").Ref<HTMLElement | undefined>>(
    "appMainScrollEl",
    ref(undefined),
);

useInfiniteScroll(
    () => (isPage.value ? mainScrollEl.value : searchResultsContainerRef.value),
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

const ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

// Single-pass replacement so every special character is escaped in one sweep —
// behaviorally identical to the chained-replace version, but unambiguous to static
// analysis (no "replace-after-escape" re-matching that sanitizers flag as incomplete).
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
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
    /** HTML with <mark> for query terms; only set when `author` is present */
    authorHighlight: string | undefined;
    languageName: string;
};

// Map of languageId → display name, sourced from the shared CMS languages list
// (kept up to date by HybridQuery via globalConfig).
const languageNames = computed(() => {
    const map = new Map<string, string>();
    for (const lang of cmsLanguages.value) {
        if (lang.name) map.set(lang._id, lang.name);
    }
    return map;
});

const trimmedQuery = computed(() => searchQuery.value.trim());

const highlightQuery = computed(() => {
    // Search is trigger-only: only highlight the last executed query, not in-progress edits.
    const q = trimmedQuery.value;
    return lastSearchedQuery.value === q ? q : lastSearchedQuery.value;
});

const results = computed<EnrichedResult[]>(() => {
    const query = highlightQuery.value;
    return (ftsResults.value as FtsSearchResult[]).map(({ doc }) => ({
        ...doc,
        titleHighlight: applyTermHighlights(stripHtml(doc.title ?? ""), query),
        highlight: createHighlight(doc, query),
        authorHighlight: doc.author ? applyTermHighlights(stripHtml(doc.author), query) : undefined,
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
        trimmedQuery.value.length >= 3 &&
        lastSearchedQuery.value !== trimmedQuery.value &&
        !isSearching.value &&
        results.value.length === 0,
);

/** Hide once the current query has been searched; reappear when query changes */
const showGoButton = computed(
    () => trimmedQuery.value.length >= 3 && lastSearchedQuery.value !== trimmedQuery.value,
);

watch(
    () => searchQuery.value,
    (newQuery, oldQuery) => {
        const trimmed = newQuery.trim();
        // Editing the query should cancel any selected result so Enter applies the search.
        if (newQuery !== oldQuery) selectedIndex.value = -1;
        if (!trimmed) {
            // Cancel any in-flight search first so a slow previous run can't repopulate results.
            resetSearch();
            selectedIndex.value = -1;
        }
    },
);

// ── Modal mode: open/close driven by the global search overlay ──────────────
watch(
    isSearchOpen,
    (open) => {
        if (isPage.value) return;
        if (!open) {
            selectedIndex.value = -1;
            return;
        }

        // Search is trigger-only: reset so the user explicitly re-runs the search, unless
        // reopening with the same term already searched (keeps results in memory).
        const openQ = searchQuery.value.trim();
        if (!openQ || lastSearchedQuery.value !== openQ) {
            resetSearch();
        }
        selectedIndex.value = -1;
        nextTick(() => {
            const hasQuery = !!searchQuery.value.trim();
            const shouldSelectAll = focusOnNextOpen.value || hasQuery;
            const shouldFocus = isMobileLayout.value
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
            // Only fetch when the current query has not already been searched (covers live + manual,
            // including "no results" where ftsResults is empty but lastSearchedQuery matches).
            if (q.length >= 3 && lastSearchedQuery.value !== q) runSearch();
        });
    },
    { immediate: true },
);

// ── Page mode: the URL is the source of truth for the query ──────────────────
// Public structured-data contract: /search?q=<URL-encoded query>. The dedicated search
// route opens and executes the FTS search. We also write `q` back (replace, no history
// spam) after a search runs so the page is shareable and back/forward keeps the query.
function applyRouteQuery(value: unknown) {
    if (!isPage.value || typeof value !== "string") return;
    const query = value.trim();
    if (query === searchQuery.value.trim()) return; // avoid sync loop
    searchQuery.value = query;
    if (query.length >= 3 && lastSearchedQuery.value !== query) runSearch();
    else if (!query) resetSearch();
}

function syncUrl(q: string) {
    if (!isPage.value) return;
    const current = typeof route.query.q === "string" ? route.query.q : "";
    if (current === q) return;
    void router.replace({ query: q ? { q } : {} });
}

watch(
    () => route.query.q,
    (q) => applyRouteQuery(q),
);

// Reflect the executed query (and the cleared state) in the URL.
watch(lastSearchedQuery, (q) => {
    if (isPage.value) syncUrl((q ?? "").trim());
});
watch(trimmedQuery, (q) => {
    if (isPage.value && !q) syncUrl("");
});

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
        if (isPage.value) return;
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
        if (isPage.value) {
            clearSearch();
            return;
        }
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

const handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (isPage.value) clearSearch();
        else closeSearch();
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
            runSearch();
            if (isMobileLayout.value) inputRef.value?.blur();
            return;
        }

        if (results.value.length > 0 && selectedIndex.value >= 0) {
            goToResult(results.value[selectedIndex.value]);
        } else {
            if (q.length < 3) return;
            pushRecentSearch(q);
            runSearch();
            if (isMobileLayout.value) inputRef.value?.blur();
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
    runSearch();
    if (isMobileLayout.value) inputRef.value?.blur();
}

const goToResult = (result: EnrichedResult) => {
    const q = lastSearchedQuery.value || trimmedQuery.value;
    if (q) pushRecentSearch(q);
    router.push({ name: "content", params: { slug: result.slug } });
    if (!isPage.value) closeSearch();
};

// Contain arrow keys within the modal so they don't scroll the page behind the overlay. Page mode is a normal page and must not capture, so arrows scroll the results there.
function handleModalKeydownCapture(event: KeyboardEvent) {
    if (isPage.value || !isSearchOpen.value) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        handleKeydown(event);
    }
}

onMounted(() => {
    if (isPage.value) {
        applyRouteQuery(route.query.q);
        // Autofocus on desktop only; on mobile a soft keyboard popping up unbidden is worse
        // than requiring a tap.
        if (!isMobileScreen.value) {
            nextTick(() => inputRef.value?.focus({ preventScroll: true }));
        }
    } else {
        document.addEventListener("keydown", handleModalKeydownCapture, true);
    }
});

onUnmounted(() => {
    if (!isPage.value) document.removeEventListener("keydown", handleModalKeydownCapture, true);
});

defineExpose({
    focus: () => inputRef.value?.focus({ preventScroll: true }),
    clear: clearSearch,
});
</script>

<template>
    <div
        :class="isPage ? '' : 'flex h-full w-full flex-col'"
        @keydown="handleKeydown"
    >
        <div
            class="flex min-w-0 items-center gap-3 border-b border-zinc-200 px-3 py-4 dark:border-slate-700 md:p-4"
        >
            <MagnifyingGlassIcon class="h-5 w-5 flex-shrink-0 text-zinc-400 md:h-6 md:w-6" />

            <div class="relative z-0 min-w-0 flex-1">
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
                    class="w-full min-w-0 bg-transparent text-base text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-slate-100 md:text-lg"
                    autocomplete="off"
                    @keydown="handleInputKeydown"
                    @focus="isInputFocused = true"
                    @blur="isInputFocused = false"
                />
            </div>
            <div
                class="relative z-10 flex h-9 flex-shrink-0 items-center gap-1.5 pr-1 md:gap-2 md:pr-0"
            >
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
                    v-if="!isPage && showHeaderCloseButton"
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
            :class="isPage ? '' : 'flex-1 overflow-y-auto scrollbar-hide'"
        >
            <div
                v-if="showPartialHint"
                class="bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 md:px-5"
            >
                {{ t("search.partialResults") }}
            </div>

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
                class="pb-24 pt-0 md:pb-3"
            >
                <ul
                    role="listbox"
                    :aria-label="t('search.ariaLabel')"
                    class="list-none divide-y divide-zinc-200 dark:divide-slate-700"
                >
                    <li
                        v-for="(result, index) in results"
                        :key="result._id"
                        :id="`search-result-${index}`"
                        role="option"
                        :aria-selected="index === selectedIndex"
                        class="group relative cursor-pointer list-none px-3 md:px-4"
                        :class="{
                            'hover:bg-zinc-50 dark:hover:bg-slate-800/70': index !== selectedIndex,
                        }"
                        @click="goToResult(result)"
                        @mouseenter="selectedIndex = index"
                    >
                        <div
                            v-if="index === selectedIndex"
                            class="pointer-events-none absolute inset-0 z-0 bg-zinc-50 dark:bg-slate-800/70"
                            aria-hidden="true"
                        />
                        <div
                            class="relative z-10 flex w-full min-w-0 items-stretch gap-2 py-2.5 md:gap-3 md:py-3"
                        >
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
                                    <template v-else>{{ stripHtml(result.title ?? "") }}</template>
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
                                        (result.languageName && result.language !== languageId)
                                    "
                                    class="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-slate-500 md:text-xs"
                                >
                                    <span
                                        v-if="result.author"
                                        class="truncate"
                                    >
                                        <span
                                            v-if="result.authorHighlight"
                                            v-html="result.authorHighlight"
                                        />
                                        <template v-else>{{ result.author }}</template>
                                    </span>
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
                                        v-if="result.languageName && result.language !== languageId"
                                        class="flex-shrink-0 uppercase tracking-wide"
                                        >{{ result.languageName }}</span
                                    >
                                </div>
                            </div>
                            <div
                                class="flex flex-shrink-0 items-center pt-0.5 text-zinc-400 dark:text-slate-500"
                                :class="{
                                    'text-amber-500 dark:text-amber-400': index === selectedIndex,
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
                <p class="text-center text-sm text-zinc-500 dark:text-slate-400 md:text-base">
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
            v-if="!isPage"
            class="hidden items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-800 md:flex md:px-5 md:py-2.5 md:text-sm"
        >
            <div class="flex items-center gap-4">
                <span class="flex items-center gap-1">
                    <kbd class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                        >ESC</kbd
                    >
                    {{ t("search.toClose") }}
                </span>
                <span class="flex items-center gap-1">
                    <kbd class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                        >↑</kbd
                    >
                    <kbd class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                        >↓</kbd
                    >
                    {{ t("search.navigate") }}
                </span>
                <span class="flex items-center gap-1">
                    <kbd class="rounded bg-zinc-200 px-1.5 py-0.5 font-medium dark:bg-slate-700"
                        >↵</kbd
                    >
                    {{ t("search.select") }}
                </span>
            </div>
        </div>
    </div>
</template>
