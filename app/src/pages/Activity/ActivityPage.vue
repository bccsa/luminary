<script lang="ts" setup>
import { computed, nextTick, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BasePage from "@/components/BasePage.vue";
import { markPageReady } from "@/util/renderState";
import ActivityAll from "./ActivityAll.vue";
import ActivityViewed from "./ActivityViewed.vue";
import ActivityLiked from "./ActivityLiked.vue";
import ActivityHighlighted from "./ActivityHighlighted.vue";

const filters = ["all", "viewed", "liked", "highlighted"] as const;
type ActivityFilter = (typeof filters)[number];

const panels = {
    all: ActivityAll,
    viewed: ActivityViewed,
    liked: ActivityLiked,
    highlighted: ActivityHighlighted,
};

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const activeFilter = computed<ActivityFilter>(() => {
    const filter = route.query.filter;
    return filters.includes(filter as ActivityFilter) ? (filter as ActivityFilter) : "all";
});

// Mirrored to the query string so a filter can be linked to and survives a reload, but
// replaced rather than pushed: back should leave the activity page, not walk back through chips.
const selectFilter = (filter: ActivityFilter) =>
    router.replace({ query: { ...route.query, filter } });

onMounted(async () => {
    await nextTick();
    markPageReady();
});
</script>

<template>
    <BasePage showBackButton>
        <div class="px-2">
            <!-- Pinned so the filters stay in reach however far the list is scrolled. The
                 mobile top bar overlays the scroller and never retracts here, so the strip
                 tucks under it; on xl there is no such bar and top-0 is the scrollport edge.
                 The negative margins let its backing bleed over the page's own padding. -->
            <div
                class="sticky top-[var(--top-bar-h,74px)] z-10 -mx-2 mb-6 flex flex-wrap gap-2 bg-white px-2 py-3 dark:bg-slate-900 xl:top-0"
                role="tablist"
                :aria-label="t('activity.title')"
            >
                <button
                    v-for="filter in filters"
                    :key="filter"
                    type="button"
                    role="tab"
                    :aria-selected="filter === activeFilter"
                    :data-test="`activity-filter-${filter}`"
                    class="rounded-full px-3 py-1 text-sm transition-colors"
                    :class="
                        filter === activeFilter
                            ? 'bg-zinc-700 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    "
                    @click="selectFilter(filter)"
                >
                    {{ t(`activity.filter.${filter}`) }}
                </button>
            </div>

            <div role="tabpanel">
                <component :is="panels[activeFilter]" />
            </div>
        </div>
    </BasePage>
</template>
