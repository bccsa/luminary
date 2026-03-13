<script lang="ts" setup>
import { ref } from "vue";
import { useFtsSearch, db } from "luminary-shared";
import type { ContentDto } from "luminary-shared";
import BasePage from "@/components/BasePage.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { computed } from "vue";

const query = ref("");
const languageId = computed(() => appLanguageIdsAsRef.value?.[0]);

const { results, isSearching, loadMore, hasMore, totalLoaded } = useFtsSearch(query, {
    languageId,
    pageSize: 20,
    maxTrigramDocPercent: 40,
});

// Resolve content docs from search results
const resolvedDocs = ref<Map<string, ContentDto>>(new Map());

// Watch results and resolve docs
import { watch } from "vue";
watch(
    results,
    async (newResults) => {
        const docIds = newResults.map((r) => r.docId);
        if (docIds.length === 0) {
            resolvedDocs.value = new Map();
            return;
        }
        const docs = await db.docs.where("_id").anyOf(docIds).toArray();
        const map = new Map<string, ContentDto>();
        for (const doc of docs) {
            map.set(doc._id, doc as ContentDto);
        }
        resolvedDocs.value = map;
    },
    { immediate: true },
);
</script>

<template>
    <BasePage>
        <h1 class="mb-4 text-xl font-medium text-zinc-700 dark:text-slate-100">
            FTS Search (Testing)
        </h1>

        <input v-model="query" type="text" placeholder="Search content... (min 3 characters)"
            class="mb-4 w-full rounded-lg border border-zinc-300 px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />

        <div v-if="isSearching" class="text-zinc-500 dark:text-slate-400">Searching...</div>

        <div v-if="!isSearching && query.length >= 3 && results.length === 0" class="text-zinc-500 dark:text-slate-400">
            No results found.
        </div>

        <div v-if="results.length > 0" class="mb-2 text-sm text-zinc-500 dark:text-slate-400">
            {{ totalLoaded }} result{{ totalLoaded === 1 ? "" : "s" }} loaded
        </div>

        <div class="flex flex-col gap-3">
            <RouterLink v-for="result in results" :key="result.docId" :to="resolvedDocs.get(result.docId)?.slug
                ? { name: 'content', params: { slug: resolvedDocs.get(result.docId)!.slug } }
                : ''"
                class="block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-blue-400 hover:bg-zinc-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-600 dark:hover:bg-slate-750">
                <div class="text-sm text-zinc-400 dark:text-slate-500">
                    Score: {{ result.score.toFixed(2) }} | Doc: {{ result.docId.slice(0, 12) }}...
                </div>
                <div v-if="resolvedDocs.get(result.docId)" class="mt-1">
                    <div class="font-medium text-zinc-800 dark:text-slate-200">
                        {{ (resolvedDocs.get(result.docId) as ContentDto).title || "(no title)" }}
                    </div>
                    <div v-if="(resolvedDocs.get(result.docId) as ContentDto).summary"
                        class="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-slate-400">
                        {{ (resolvedDocs.get(result.docId) as ContentDto).summary }}
                    </div>
                </div>
                <div v-else class="mt-1 text-sm italic text-zinc-400 dark:text-slate-500">
                    (document not found in local DB)
                </div>
            </RouterLink>
        </div>

        <button v-if="hasMore && !isSearching"
            class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" @click="loadMore">
            Load more
        </button>
    </BasePage>
</template>
