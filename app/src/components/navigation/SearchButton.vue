<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from "vue";
import {
    MagnifyingGlassIcon,
    XMarkIcon,
    ArrowRightIcon,
    DocumentTextIcon,
} from "@heroicons/vue/24/outline";
import { useSearch } from "@/composables/useSearch";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import type { LuminarySearchResult } from "@/search";
import { useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";

const router = useRouter();

const { performSearch, isInitialized, indexSize } = useSearch();

// Use global search overlay state
const { isSearchOpen, closeSearch } = useSearchOverlay();

// Local state synced with global
const isOpen = ref(false);
const searchQuery = ref("");
const results = ref<LuminarySearchResult[]>([]);
const showResults = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
const modalRef = ref<HTMLDivElement | null>(null);
const selectedIndex = ref(-1);
const isSearching = ref(false);

// Debounce timer
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// Clean up debounce timer
function clearSearchTimeout(): void {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
}

// Watch global state and sync local state
watch(isSearchOpen, (open) => {
    isOpen.value = open;
    if (!open) {
        // Clear search when closed
        clearSearchTimeout();
        searchQuery.value = "";
        results.value = [];
        showResults.value = false;
        selectedIndex.value = -1;
        isSearching.value = false;
    } else {
        // Focus input when opened so user can type immediately
        nextTick(() => {
            inputRef.value?.focus();
        });
    }
});

// Watch for search query changes and perform search
watch(searchQuery, (newQuery) => {
    clearSearchTimeout();

    if (!newQuery.trim()) {
        results.value = [];
        showResults.value = false;
        selectedIndex.value = -1;
        isSearching.value = false;
        return;
    }

    // Debounce search
    isSearching.value = true;
    searchTimeout = setTimeout(() => {
        if (isInitialized.value) {
            const searchResults = performSearch(newQuery);
            results.value = searchResults;
            showResults.value = searchResults.length > 0;
            selectedIndex.value = searchResults.length > 0 ? 0 : -1;
        }
        isSearching.value = false;
    }, 150);
});

// Handle arrow key navigation
const handleKeydown = (event: KeyboardEvent) => {
    // Handle Cmd/Ctrl+K to toggle search
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (isOpen.value) {
            closeSearch();
        } else {
            isSearchOpen.value = true;
        }
        return;
    }

    // Handle Escape to close search
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
    }

    // Arrow navigation in results
    if (showResults.value && results.value.length > 0) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            selectedIndex.value = Math.max(-1, selectedIndex.value - 1);
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
            return;
        }

        // Handle Enter to select current result
        if (event.key === "Enter") {
            event.preventDefault();
            if (selectedIndex.value >= 0 && selectedIndex.value < results.value.length) {
                goToResult(results.value[selectedIndex.value]);
            }
            return;
        }
    }
};

// Handle keydown in input
const handleInputKeydown = (event: KeyboardEvent) => {
    // Handle Escape in input
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
    }

    // Arrow navigation
    if (showResults.value && results.value.length > 0) {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            selectedIndex.value = Math.max(-1, selectedIndex.value - 1);
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
            return;
        }

        // Handle Enter when we have results
        if (event.key === "Enter") {
            event.preventDefault();
            if (selectedIndex.value >= 0 && selectedIndex.value < results.value.length) {
                goToResult(results.value[selectedIndex.value]);
            }
            return;
        }
    }
};

const clearSearch = () => {
    clearSearchTimeout();
    searchQuery.value = "";
    results.value = [];
    showResults.value = false;
    selectedIndex.value = -1;
    inputRef.value?.focus();
};

const goToResult = (result: LuminarySearchResult) => {
    // MiniSearch returns stored fields directly on the result object
    router.push({
        name: "content",
        params: {
            slug: result.slug,
        },
    });

    // Close and clear
    showResults.value = false;
    searchQuery.value = "";
    closeSearch();
};

const toggleSearch = () => {
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
        nextTick(() => {
            inputRef.value?.focus();
        });
    } else {
        closeSearch();
    }
};

// Global keyboard shortcut (Cmd/Ctrl + K)
let handleGlobalKeydown: ((event: KeyboardEvent) => void) | null = null;

onMounted(() => {
    // Global keyboard listener for Cmd/Ctrl+K when search is closed
    handleGlobalKeydown = (event: KeyboardEvent) => {
        // Handle Cmd/Ctrl+K to toggle search
        if ((event.metaKey || event.ctrlKey) && event.key === "k") {
            // Only handle when search is not open
            if (!isOpen.value) {
                event.preventDefault();
                isSearchOpen.value = true;
            }
            return;
        }

        // Handle Escape to close search when open
        if (event.key === "Escape" && isOpen.value) {
            event.preventDefault();
            closeSearch();
            return;
        }
    };

    document.addEventListener("keydown", handleGlobalKeydown);
});

// Cleanup
onUnmounted(() => {
    if (handleGlobalKeydown) {
        document.removeEventListener("keydown", handleGlobalKeydown);
    }
    clearSearchTimeout();
});

// Computed for responsive classes
const overlayClasses = computed(() => {
    return "md:pt-24 pt-16";
});

const modalClasses = computed(() => {
    return "md:rounded-xl md:shadow-2xl w-full md:max-w-3xl md:h-auto h-full md:max-h-[75vh]";
});

// Expose toggle for parent components
defineExpose({
    toggleSearch,
});
</script>

<template>
    <div class="relative">
        <!-- Search Overlay -->
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
                class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm md:p-4"
                :class="overlayClasses"
                @click.self="toggleSearch"
            >
                <!-- Search Modal -->
                <div
                    ref="modalRef"
                    class="flex w-full flex-col overflow-hidden bg-white dark:bg-slate-900"
                    :class="modalClasses"
                    tabindex="-1"
                    @keydown="handleKeydown"
                >
                    <!-- Search Header -->
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
                            <kbd
                                class="hidden rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-slate-800 dark:text-slate-400 md:inline-block"
                            >
                                ESC
                            </kbd>
                            <button
                                v-if="searchQuery"
                                @click="clearSearch"
                                class="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                            >
                                <XMarkIcon class="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <!-- Search Body -->
                    <div class="flex-1 overflow-y-auto">
                        <!-- Loading State -->
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

                        <!-- No Index / Not Initialized -->
                        <div
                            v-else-if="!isInitialized && searchQuery"
                            class="p-8 text-center md:p-10"
                        >
                            <DocumentTextIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600 md:h-14 md:w-14"
                            />
                            <p class="mt-2 text-sm text-zinc-500 dark:text-slate-400 md:text-base">
                                {{ $t("search.initializing") || "Initializing search index..." }}
                            </p>
                        </div>

                        <div
                            v-else-if="isInitialized && indexSize === 0"
                            class="p-8 text-center md:p-10"
                        >
                            <DocumentTextIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600 md:h-14 md:w-14"
                            />
                            <p class="mt-2 text-sm text-zinc-500 dark:text-slate-400 md:text-base">
                                {{ $t("search.noIndex") || "Search index is empty" }}
                            </p>
                        </div>

                        <!-- Search Results -->
                        <div
                            v-else-if="showResults && results.length > 0"
                            id="search-results-container"
                            class="max-h-[60vh] overflow-y-auto py-2 md:max-h-[65vh] md:py-3"
                        >
                            <ul class="divide-y divide-zinc-200 dark:divide-slate-700">
                                <li
                                    v-for="(result, index) in results"
                                    :key="result.id"
                                    :id="`search-result-${index}`"
                                    class="group cursor-pointer px-3 py-2.5 transition-colors first:pt-0 last:pb-2 hover:bg-zinc-50 dark:hover:bg-slate-800/70 md:px-4 md:py-3 md:last:pb-3"
                                    :class="{
                                        'bg-zinc-50 dark:bg-slate-800/70': index === selectedIndex,
                                    }"
                                    @click="goToResult(result)"
                                    @mouseenter="selectedIndex = index"
                                >
                                    <div class="flex min-w-0 gap-2 self-center md:gap-3">
                                        <!-- Thumbnail (same as SingleContent: LImage shows image or fallback) -->
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
                                                {{ result.title }}
                                            </h3>
                                            <!-- Snippet: highlight when available, else summary -->
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
                                            <!-- Meta -->
                                            <div
                                                v-if="result.author || result.language"
                                                class="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-slate-500 md:text-xs"
                                            >
                                                <span
                                                    v-if="result.author"
                                                    class="truncate"
                                                    >{{ result.author }}</span
                                                >
                                                <span
                                                    v-if="result.author && result.language"
                                                    class="flex-shrink-0 text-zinc-300 dark:text-slate-600"
                                                    aria-hidden="true"
                                                    >·</span
                                                >
                                                <span
                                                    v-if="result.language"
                                                    class="flex-shrink-0 uppercase tracking-wide"
                                                    >{{ result.language }}</span
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

                    <!-- Search Footer -->
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
                        <div v-if="isInitialized">
                            <span
                                >{{ indexSize }}
                                {{ indexSize === 1 ? "item" : "items" }} indexed</span
                            >
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
