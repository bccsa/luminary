<script lang="ts" setup>
import { computed, nextTick, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BasePage from "@/components/BasePage.vue";
import { markPageReady } from "@/util/renderState";
import LibraryViewed from "./LibraryViewed.vue";
import LibraryLiked from "./LibraryLiked.vue";
import LibraryHighlighted from "./LibraryHighlighted.vue";

const filters = ["viewed", "liked", "highlighted"] as const;
type LibraryFilter = (typeof filters)[number];

const panels = {
    viewed: LibraryViewed,
    liked: LibraryLiked,
    highlighted: LibraryHighlighted,
};

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const activeFilter = computed<LibraryFilter>(() => {
    const filter = route.query.filter;
    return filters.includes(filter as LibraryFilter) ? (filter as LibraryFilter) : "viewed";
});

// Mirrored to the query string so a filter can be linked to and survives a reload, but
// replaced rather than pushed: back should leave the Library, not walk back through chips.
const selectFilter = (filter: LibraryFilter) =>
    router.replace({ query: { ...route.query, filter } });

onMounted(async () => {
    await nextTick();
    markPageReady();
});
</script>

<template>
    <BasePage>
        <div class="px-2">
            <h1 class="mb-4 text-xl font-medium text-zinc-700 dark:text-slate-100">
                {{ t("library.title") }}
            </h1>

            <div
                class="mb-6 flex flex-wrap gap-2"
                role="tablist"
                :aria-label="t('library.title')"
            >
                <button
                    v-for="filter in filters"
                    :key="filter"
                    type="button"
                    role="tab"
                    :aria-selected="filter === activeFilter"
                    :data-test="`library-filter-${filter}`"
                    class="rounded-full px-3 py-1 text-sm transition-colors"
                    :class="
                        filter === activeFilter
                            ? 'bg-zinc-700 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    "
                    @click="selectFilter(filter)"
                >
                    {{ t(`library.filter.${filter}`) }}
                </button>
            </div>

            <div role="tabpanel">
                <component :is="panels[activeFilter]" />
            </div>
        </div>
    </BasePage>
</template>
