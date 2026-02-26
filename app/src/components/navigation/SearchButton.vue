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

const router = useRouter();

const { search, isInitialized, indexSize } = useSearch();

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

// Watch global state and sync local state
watch(isSearchOpen, (open) => {
    isOpen.value = open;
    if (!open) {
        // Clear search when closed
        searchQuery.value = "";
        results.value = [];
        showResults.value = false;
        selectedIndex.value = -1;
    } else {
        // Focus input when opened so user can type immediately
        setTimeout(() => {
            inputRef.value?.focus();
        }, 100);
    }
});

// Debounce timer
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// Watch for search query changes and perform search
watch(searchQuery, (newQuery) => {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    if (!newQuery.trim()) {
        results.value = [];
        showResults.value = false;
        selectedIndex.value = -1;
        isSearching.value = false;
        return;
    }

    // Debounce search
    searchTimeout = setTimeout(() => {
        if (isInitialized.value) {
            isSearching.value = true;
            results.value = search(newQuery, {
                status: "published",
            });
            showResults.value = results.value.length > 0;
            selectedIndex.value = results.value.length > 0 ? 0 : -1;
            // Reset searching after a small delay to show loading state
            setTimeout(() => {
                isSearching.value = false;
            }, 100);
        }
    }, 150);
});

// Keyboard navigation
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

    if (!showResults.value || results.value.length === 0) return;

    switch (event.key) {
        case "ArrowDown":
            event.preventDefault();
            selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1);
            scrollToSelected();
            break;
        case "ArrowUp":
            event.preventDefault();
            selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
            scrollToSelected();
            break;
        case "Enter":
            event.preventDefault();
            if (selectedIndex.value >= 0 && selectedIndex.value < results.value.length) {
                goToResult(results.value[selectedIndex.value]);
            }
            break;
        case "Escape":
            event.preventDefault();
            closeSearch();
            break;
    }
};

// Handle keydown in input - allow arrow keys to bubble to modal for navigation
const handleInputKeydown = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Escape"].includes(event.key)) {
        // Let these keys bubble up to the modal
        return;
    }
    // Other keys will be handled normally by the input
};

const scrollToSelected = () => {
    const container = document.getElementById("search-results-container");
    const selected = document.getElementById(`search-result-${selectedIndex.value}`);
    if (container && selected) {
        selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
};

const clearSearch = () => {
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
        setTimeout(() => {
            inputRef.value?.focus();
        }, 100);
    } else {
        closeSearch();
    }
};

// Global keyboard shortcut (Cmd/Ctrl + K) - handled in onMounted

onMounted(() => {
    // Global keyboard listener for Cmd/Ctrl+K when search is closed
    const handleGlobalKeydown = (event: KeyboardEvent) => {
        // Handle Cmd/Ctrl+K to toggle search
        if ((event.metaKey || event.ctrlKey) && event.key === "k") {
            // Only handle when search is not open
            // When search is open, the modal's handleKeydown handles it
            if (!isOpen.value) {
                event.preventDefault();
                isSearchOpen.value = true;
                // Focus will be handled by the watcher
            }
        }

        // Handle arrow keys and escape when search is open
        // This ensures navigation works even when input has focus
        if (isOpen.value && inputRef.value?.contains(document.activeElement)) {
            if (["ArrowDown", "ArrowUp", "Escape", "Enter"].includes(event.key)) {
                // Prevent default behavior for these keys in the input
                event.preventDefault();

                // Dispatch the event to the modal's handler
                handleKeydown(event);
            }
        }
    };

    document.addEventListener("keydown", handleGlobalKeydown);

    // Cleanup
    onUnmounted(() => {
        document.removeEventListener("keydown", handleGlobalKeydown);
    });
});

// Computed for responsive classes
const overlayClasses = computed(() => {
    return "md:pt-24 pt-16";
});

const modalClasses = computed(() => {
    return "md:rounded-xl md:shadow-2xl md:max-w-2xl w-full md:h-auto h-full md:max-h-[70vh]";
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
                        class="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-slate-700"
                    >
                        <MagnifyingGlassIcon class="h-5 w-5 flex-shrink-0 text-zinc-400" />
                        <input
                            ref="inputRef"
                            v-model="searchQuery"
                            type="text"
                            :placeholder="$t('search.placeholder') || 'Search content...'"
                            class="flex-1 bg-transparent text-lg text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-slate-100"
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
                            class="p-4"
                        >
                            <div class="space-y-3">
                                <div
                                    v-for="i in 3"
                                    :key="i"
                                    class="flex gap-3"
                                >
                                    <div
                                        class="h-16 w-24 flex-shrink-0 animate-pulse rounded-md bg-zinc-200 dark:bg-slate-700"
                                    ></div>
                                    <div class="flex-1 space-y-2">
                                        <div
                                            class="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-slate-700"
                                        ></div>
                                        <div
                                            class="h-3 w-full animate-pulse rounded bg-zinc-200 dark:bg-slate-700"
                                        ></div>
                                        <div
                                            class="h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-slate-700"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- No Index / Not Initialized -->
                        <div
                            v-else-if="!isInitialized && searchQuery"
                            class="p-8 text-center"
                        >
                            <DocumentTextIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600"
                            />
                            <p class="mt-2 text-sm text-zinc-500">
                                {{ $t("search.initializing") || "Initializing search index..." }}
                            </p>
                        </div>

                        <div
                            v-else-if="isInitialized && indexSize === 0"
                            class="p-8 text-center"
                        >
                            <DocumentTextIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600"
                            />
                            <p class="mt-2 text-sm text-zinc-500">
                                {{ $t("search.noIndex") || "Search index is empty" }}
                            </p>
                        </div>

                        <!-- Search Results -->
                        <div
                            v-else-if="showResults && results.length > 0"
                            id="search-results-container"
                            class="max-h-[60vh] overflow-y-auto"
                        >
                            <ul class="divide-y divide-zinc-100 dark:divide-slate-800">
                                <li
                                    v-for="(result, index) in results"
                                    :key="result.id"
                                    :id="`search-result-${index}`"
                                    class="cursor-pointer px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-slate-800"
                                    :class="{
                                        'bg-yellow-50 dark:bg-yellow-900/20':
                                            index === selectedIndex,
                                    }"
                                    @click="goToResult(result)"
                                    @mouseenter="selectedIndex = index"
                                >
                                    <div class="flex gap-3">
                                        <!-- Thumbnail placeholder -->
                                        <div
                                            class="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-slate-700"
                                        >
                                            <DocumentTextIcon
                                                class="h-8 w-8 text-zinc-300 dark:text-slate-500"
                                            />
                                        </div>
                                        <div class="flex-1 overflow-hidden">
                                            <h3
                                                class="font-medium text-zinc-900 dark:text-slate-100"
                                                :class="{
                                                    'text-yellow-700 dark:text-yellow-400':
                                                        index === selectedIndex,
                                                }"
                                            >
                                                {{ result.title }}
                                            </h3>
                                            <p
                                                v-if="result.summary"
                                                class="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-slate-400"
                                            >
                                                {{ result.summary }}
                                            </p>
                                            <!-- Highlighted text snippet -->
                                            <p
                                                v-if="result.highlight"
                                                class="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-slate-300"
                                                v-html="result.highlight"
                                            ></p>
                                            <div
                                                class="mt-2 flex items-center gap-3 text-xs text-zinc-400"
                                            >
                                                <span v-if="result.author">{{
                                                    result.author
                                                }}</span>
                                                <span
                                                    v-if="result.language"
                                                    class="uppercase"
                                                    >{{ result.language }}</span
                                                >
                                            </div>
                                        </div>
                                        <div
                                            v-if="index === selectedIndex"
                                            class="flex items-center text-zinc-400"
                                        >
                                            <ArrowRightIcon class="h-4 w-4" />
                                        </div>
                                    </div>
                                </li>
                            </ul>
                        </div>

                        <!-- No Results -->
                        <div
                            v-else-if="searchQuery.trim() && isInitialized && results.length === 0"
                            class="p-8 text-center"
                        >
                            <MagnifyingGlassIcon
                                class="mx-auto h-12 w-12 text-zinc-300 dark:text-slate-600"
                            />
                            <p class="mt-2 text-sm text-zinc-500">
                                {{ $t("search.noResults") || "No results found" }}
                            </p>
                            <p class="mt-1 text-xs text-zinc-400">Try different keywords</p>
                        </div>

                        <!-- Empty State -->
                        <div
                            v-else-if="!searchQuery"
                            class="p-8 text-center"
                        >
                            <p class="text-sm text-zinc-500">
                                {{ $t("search.startTyping") || "Start typing to search..." }}
                            </p>
                        </div>
                    </div>

                    <!-- Search Footer -->
                    <div
                        class="hidden items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-slate-700 dark:bg-slate-800 md:flex"
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
