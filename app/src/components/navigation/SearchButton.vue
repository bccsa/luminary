<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from "vue";
import {
    MagnifyingGlassIcon,
    XMarkIcon,
    ArrowRightIcon,
} from "@heroicons/vue/24/outline";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useRouter } from "vue-router";
import LImage from "@/components/images/LImage.vue";
import { useFtsSearch, db } from "luminary-shared";
import type { ContentDto } from "luminary-shared";

const router = useRouter();

const { isSearchOpen, closeSearch } = useSearchOverlay();

const isOpen = ref(false);
const searchQuery = ref("");
const selectedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);

const languageId = computed(() => appLanguageIdsAsRef.value?.[0]);

const { results: ftsResults, isSearching } = useFtsSearch(searchQuery, {
    languageId,
    debounceMs: 150,
    pageSize: 20,
});

// Resolved content docs keyed by docId
const resolvedDocs = ref<Map<string, ContentDto>>(new Map());

watch(ftsResults, async (newResults) => {
    if (!newResults.length) {
        resolvedDocs.value = new Map();
        return;
    }
    const docIds = newResults.map((r) => r.docId);
    const docs = await db.docs.where("_id").anyOf(docIds).toArray();
    const map = new Map<string, ContentDto>();
    for (const doc of docs) {
        map.set(doc._id, doc as ContentDto);
    }
    resolvedDocs.value = map;
});

// Enriched results: only items where the doc was successfully resolved
const results = computed(() =>
    ftsResults.value
        .map((r) => resolvedDocs.value.get(r.docId))
        .filter((doc): doc is ContentDto => !!doc),
);

const showResults = computed(() => results.value.length > 0 && !!searchQuery.value.trim());

// Sync overlay open state
watch(isSearchOpen, (open) => {
    isOpen.value = open;
    if (!open) {
        searchQuery.value = "";
        selectedIndex.value = -1;
    } else {
        nextTick(() => {
            inputRef.value?.focus();
        });
    }
});

// Reset selection when results change
watch(results, (newResults) => {
    selectedIndex.value = newResults.length > 0 ? 0 : -1;
});

const handleKeydown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (isOpen.value) {
            closeSearch();
        } else {
            isSearchOpen.value = true;
        }
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
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            if (selectedIndex.value >= 0 && selectedIndex.value < results.value.length) {
                goToResult(results.value[selectedIndex.value]);
            }
            return;
        }
    }
};

const handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
    }
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
    searchQuery.value = "";
    inputRef.value?.focus();
};

const goToResult = (doc: ContentDto) => {
    router.push({ name: "content", params: { slug: doc.slug } });
    searchQuery.value = "";
    closeSearch();
};

let handleGlobalKeydown: ((event: KeyboardEvent) => void) | null = null;

onMounted(() => {
    handleGlobalKeydown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "k") {
            if (!isOpen.value) {
                event.preventDefault();
                isSearchOpen.value = true;
            }
            return;
        }
        if (event.key === "Escape" && isOpen.value) {
            event.preventDefault();
            closeSearch();
            return;
        }
    };
    document.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
    if (handleGlobalKeydown) {
        document.removeEventListener("keydown", handleGlobalKeydown);
    }
});

const overlayClasses = computed(() => "md:pt-24 pt-16");
const modalClasses = computed(
    () => "md:rounded-xl md:shadow-2xl w-full md:max-w-3xl md:h-auto h-full md:max-h-[75vh]",
);

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
                class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm md:p-4"
                :class="overlayClasses"
                @click.self="closeSearch"
            >
                <!-- Search Modal -->
                <div
                    class="flex w-full flex-col overflow-hidden bg-white dark:bg-slate-900"
                    :class="modalClasses"
                    tabindex="-1"
                    @keydown="handleKeydown"
                >
                    <!-- Header -->
                    <div
                        class="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-slate-700 md:p-5"
                    >
                        <MagnifyingGlassIcon class="h-5 w-5 flex-shrink-0 text-zinc-400 md:h-6 md:w-6" />
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
                                class="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                @click="clearSearch"
                            >
                                <XMarkIcon class="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="flex-1 overflow-y-auto">
                        <!-- Loading -->
                        <div v-if="isSearching" class="p-4 md:p-5">
                            <div class="space-y-3 md:space-y-4">
                                <div v-for="i in 3" :key="i" class="flex gap-3 md:gap-4">
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

                        <!-- Results -->
                        <div
                            v-else-if="showResults"
                            class="max-h-[60vh] overflow-y-auto py-2 md:max-h-[65vh] md:py-3"
                        >
                            <ul class="divide-y divide-zinc-200 dark:divide-slate-700">
                                <li
                                    v-for="(doc, index) in results"
                                    :key="doc._id"
                                    :id="`search-result-${index}`"
                                    class="group cursor-pointer px-3 py-2.5 transition-colors first:pt-0 last:pb-2 hover:bg-zinc-50 dark:hover:bg-slate-800/70 md:px-4 md:py-3 md:last:pb-3"
                                    :class="{
                                        'bg-zinc-50 dark:bg-slate-800/70': index === selectedIndex,
                                    }"
                                    @click="goToResult(doc)"
                                    @mouseenter="selectedIndex = index"
                                >
                                    <div class="flex min-w-0 gap-2 self-center md:gap-3">
                                        <!-- Thumbnail -->
                                        <div class="flex flex-shrink-0 items-center justify-center">
                                            <LImage
                                                :image="doc.parentImageData"
                                                :content-parent-id="doc.parentId"
                                                :parent-image-bucket-id="doc.parentImageBucketId"
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
                                                {{ doc.title }}
                                            </h3>
                                            <p
                                                v-if="doc.summary"
                                                class="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-600 dark:text-slate-400 md:mt-1 md:text-sm"
                                            >
                                                {{ doc.summary }}
                                            </p>
                                            <div
                                                v-if="doc.author"
                                                class="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-slate-500 md:text-xs"
                                            >
                                                <span class="truncate">{{ doc.author }}</span>
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
                            <span>{{ results.length }} {{ results.length === 1 ? "result" : "results" }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>
