<script setup lang="ts">
import { ref, watch } from "vue";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/vue/24/outline";
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

// Watch global state and sync local state
watch(isSearchOpen, (open) => {
    isOpen.value = open;
    if (!open) {
        // Clear search when closed
        searchQuery.value = "";
        results.value = [];
        showResults.value = false;
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
        return;
    }

    // Debounce search
    searchTimeout = setTimeout(() => {
        if (isInitialized.value) {
            results.value = search(newQuery, {
                status: "published",
            });
            showResults.value = results.value.length > 0;
        }
    }, 150);
});

const handleFocus = () => {
    if (searchQuery.value.trim() && results.value.length > 0) {
        showResults.value = true;
    }
};

const handleBlur = () => {
    // Delay hiding to allow clicking on results
    setTimeout(() => {
        showResults.value = false;
    }, 200);
};

const clearSearch = () => {
    searchQuery.value = "";
    results.value = [];
    showResults.value = false;
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

// Expose toggle for parent components
defineExpose({
    toggleSearch,
});
</script>

<template>
    <div class="relative">
        <!-- Search Overlay -->
        <div
            v-if="isOpen"
            class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20"
            @click.self="toggleSearch"
        >
            <div class="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl dark:bg-slate-800">
                <!-- Search Input -->
                <div class="relative">
                    <MagnifyingGlassIcon
                        class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
                    />
                    <input
                        ref="inputRef"
                        v-model="searchQuery"
                        type="text"
                        :placeholder="$t('search.placeholder')"
                        class="w-full rounded-md border border-zinc-300 bg-zinc-50 py-3 pl-10 pr-10 text-zinc-900 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        @focus="handleFocus"
                        @blur="handleBlur"
                    />
                    <button
                        v-if="searchQuery"
                        @click="clearSearch"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                        <XMarkIcon class="h-5 w-5" />
                    </button>
                </div>

                <!-- Search Status -->
                <div
                    v-if="!isInitialized && searchQuery"
                    class="mt-2 text-sm text-zinc-500"
                >
                    {{ $t("search.initializing") }}
                </div>
                <div
                    v-else-if="isInitialized && indexSize === 0"
                    class="mt-2 text-sm text-zinc-500"
                >
                    {{ $t("search.noIndex") }}
                </div>

                <!-- Search Results -->
                <div
                    v-if="showResults"
                    class="mt-2 max-h-96 overflow-y-auto rounded-md border border-zinc-200 dark:border-slate-600"
                >
                    <ul>
                        <li
                            v-for="result in results"
                            :key="result.id"
                            class="cursor-pointer border-b border-zinc-100 px-4 py-3 hover:bg-zinc-100 dark:border-slate-700 dark:hover:bg-slate-700"
                            @click="goToResult(result)"
                        >
                            <div class="font-medium text-zinc-900 dark:text-slate-100">
                                {{ result.title }}
                            </div>
                            <div
                                v-if="result.summary"
                                class="mt-1 truncate text-sm text-zinc-500 dark:text-slate-400"
                            >
                                {{ result.summary }}
                            </div>
                            <div class="mt-1 text-xs text-zinc-400">
                                {{ $t("search.score") }}: {{ result.score.toFixed(2) }}
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- No Results -->
                <div
                    v-else-if="searchQuery.trim() && isInitialized && results.length === 0"
                    class="mt-2 text-center text-zinc-500"
                >
                    {{ $t("search.noResults") }}
                </div>

                <!-- Index Info -->
                <div
                    v-if="isInitialized"
                    class="mt-2 text-xs text-zinc-400"
                >
                    {{ $t("search.indexed", { count: indexSize }) }}
                </div>
            </div>
        </div>
    </div>
</template>
