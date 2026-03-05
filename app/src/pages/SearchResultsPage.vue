<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import { useSearch } from "@/composables/useSearch";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { isMeaningOrQuestionQuery } from "@/search/isMeaningOrQuestionQuery";
import { fetchSearchAnswer } from "@/search/searchAnswerApi";
import type { LuminarySearchResult } from "@/search";
import LImage from "@/components/images/LImage.vue";
import { ArrowRightIcon, SparklesIcon, DocumentTextIcon } from "@heroicons/vue/24/outline";

const route = useRoute();
const router = useRouter();
const query = computed(() => (route.query.q as string) || "");
const { performSearch, isInitialized } = useSearch();

const results = ref<LuminarySearchResult[]>([]);
const aiAnswer = ref<{ answer: string; sourceContentIds: string[] } | null>(null);
const aiLoading = ref(false);
const aiFailed = ref(false);
/** True once we've finished the AI request (so we can show "unavailable" when API returns null). */
const aiRequestDone = ref(false);

function runSearch(): void {
    const q = query.value.trim();
    if (!q) {
        results.value = [];
        aiAnswer.value = null;
        aiRequestDone.value = false;
        return;
    }
    results.value = performSearch(q, {
        languages:
            appLanguageIdsAsRef.value.length > 0 ? appLanguageIdsAsRef.value : undefined,
    });
    if (isMeaningOrQuestionQuery(q)) {
        aiLoading.value = true;
        aiFailed.value = false;
        aiRequestDone.value = false;
        fetchSearchAnswer(q)
            .then((data) => {
                aiAnswer.value = data;
            })
            .catch(() => {
                aiFailed.value = true;
            })
            .finally(() => {
                aiLoading.value = false;
                aiRequestDone.value = true;
            });
    } else {
        aiAnswer.value = null;
        aiRequestDone.value = false;
    }
}

function goToResult(result: LuminarySearchResult): void {
    router.push({ name: "content", params: { slug: result.slug } });
}

watch([query, isInitialized], () => {
    runSearch();
}, { immediate: true });

onMounted(() => {
    runSearch();
});
</script>

<template>
    <BasePage>
        <div class="mx-auto max-w-3xl">
            <!-- Empty query state -->
            <template v-if="!query">
                <h1 class="mb-2 text-xl font-medium text-zinc-800 dark:text-slate-100 md:text-2xl">
                    {{ $t("search.results") || "Search" }}
                </h1>
                <p class="text-sm text-zinc-500 dark:text-slate-400">
                    {{ $t("search.useSearchModal") || "Use the search (Cmd+K) or add ?q=... to the URL." }}
                </p>
            </template>

            <!-- Search query as heading -->
            <template v-else>
            <h1 class="mb-4 text-xl font-medium text-zinc-800 dark:text-slate-100 md:text-2xl">
                {{ $t("search.resultsFor") || "Results for" }}
                <span class="font-semibold">"{{ query }}"</span>
            </h1>

            <!-- AI answer box (for meaning/question-style queries; show even when no answer so user sees "unavailable") -->
            <section
                v-if="isMeaningOrQuestionQuery(query) && (aiLoading || aiRequestDone)"
                class="mb-8 rounded-xl border border-zinc-200 bg-amber-50/50 p-5 dark:border-slate-700 dark:bg-amber-950/20 md:p-6"
                aria-label="AI explanation"
            >
                <div class="mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <SparklesIcon class="h-5 w-5 flex-shrink-0" />
                    <span class="text-sm font-medium">
                        {{ $t("search.aiExplanation") || "Explanation" }}
                    </span>
                </div>
                <p
                    v-if="aiLoading"
                    class="animate-pulse text-zinc-500 dark:text-slate-400"
                >
                    {{ $t("search.aiLoading") || "Loading explanation..." }}
                </p>
                <p
                    v-else-if="aiAnswer"
                    class="text-zinc-700 dark:text-slate-200 md:text-base"
                >
                    {{ aiAnswer.answer }}
                </p>
                <p
                    v-else
                    class="text-sm text-zinc-500 dark:text-slate-400"
                >
                    {{ $t("search.aiUnavailable") || "Explanation unavailable." }}
                </p>
            </section>

            <!-- Keyword search results -->
            <section aria-label="Search results">
                <h2 class="mb-3 text-sm font-medium text-zinc-500 dark:text-slate-400">
                    {{ $t("search.contentResults") || "Content" }}
                </h2>
                <div v-if="!isInitialized" class="py-8 text-center text-zinc-500 dark:text-slate-400">
                    {{ $t("search.initializing") || "Initializing search..." }}
                </div>
                <div
                    v-else-if="results.length === 0"
                    class="flex flex-col items-center justify-center py-12 text-center"
                >
                    <DocumentTextIcon
                        class="h-12 w-12 text-zinc-300 dark:text-slate-600 md:h-14 md:w-14"
                    />
                    <p class="mt-2 text-sm text-zinc-500 dark:text-slate-400">
                        {{ $t("search.noResults") || "No results found" }}
                    </p>
                </div>
                <ul v-else class="divide-y divide-zinc-200 dark:divide-slate-700">
                    <li
                        v-for="(result, index) in results"
                        :key="result._id ?? index"
                        class="group cursor-pointer py-4 transition-colors first:pt-0 hover:bg-zinc-50 dark:hover:bg-slate-800/50"
                        @click="goToResult(result)"
                    >
                        <div class="flex min-w-0 gap-3">
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
                                <h3 class="font-semibold text-zinc-900 dark:text-slate-100">
                                    {{ result.title }}
                                </h3>
                                <p
                                    v-if="result.highlight"
                                    class="mt-0.5 line-clamp-2 text-sm text-zinc-600 dark:text-slate-400"
                                    v-html="result.highlight"
                                />
                                <p
                                    v-else-if="result.summary"
                                    class="mt-0.5 line-clamp-2 text-sm text-zinc-600 dark:text-slate-400"
                                >
                                    {{ result.summary }}
                                </p>
                                <div
                                    v-if="result.author || result.language"
                                    class="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 dark:text-slate-500"
                                >
                                    <span v-if="result.author">{{ result.author }}</span>
                                    <span
                                        v-if="result.author && result.language"
                                        class="text-zinc-300 dark:text-slate-600"
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                    <span v-if="result.language" class="uppercase tracking-wide">
                                        {{ result.language }}
                                    </span>
                                </div>
                            </div>
                            <div
                                class="flex flex-shrink-0 items-center text-zinc-400 group-hover:text-amber-500 dark:text-slate-500 dark:group-hover:text-amber-400"
                            >
                                <ArrowRightIcon class="h-5 w-5" />
                            </div>
                        </div>
                    </li>
                </ul>
            </section>
            </template>
        </div>
    </BasePage>
</template>
