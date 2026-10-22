<script lang="ts" setup>
import { computed, nextTick, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { markPageReady } from "@/util/renderState";
import ActivityFilterChips from "./ActivityFilterChips.vue";
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

const route = useRoute();
const router = useRouter();
const mobileChrome = useMobileChromeAutoHide();

const activeFilter = computed<ActivityFilter>(() => {
    const filter = route.query.filter;
    return filters.includes(filter as ActivityFilter) ? (filter as ActivityFilter) : "all";
});

// Mirrored to the query string so a filter can be linked to and survives a reload, but
// replaced rather than pushed: back should leave the activity page, not walk back through chips.
const selectFilter = (filter: ActivityFilter) =>
    router.replace({ query: { ...route.query, filter } });

// The strip is pinned at the scrollport edge and pushed down by the top bar's height while the
// bar shows. A transform on the bar's own timeline keeps the two in lockstep; animating `top`
// would lag behind the bar mid-scroll.
const mobileFilterStyle = computed(() => ({
    transform: mobileChrome.hidden.value
        ? "translateY(max(0px, calc(env(safe-area-inset-top) - 0.75rem)))"
        : "translateY(var(--top-bar-h, 74px))",
}));

onMounted(async () => {
    await nextTick();
    markPageReady();
});
</script>

<template>
    <BasePage
        showBackButton
        desktopTopBar
    >
        <template #topBarLeading>
            <ActivityFilterChips
                :filters="filters"
                :active="activeFilter"
                @select="selectFilter($event as ActivityFilter)"
            />
        </template>

        <div class="px-2">
            <div
                class="sticky top-0 z-10 -mx-2 -mt-[var(--top-bar-h,74px)] mb-[calc(var(--top-bar-h,74px)+1.5rem)] bg-white px-2 py-3 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform before:absolute before:inset-x-0 before:bottom-full before:h-2 before:bg-inherit dark:bg-slate-900 xl:hidden"
                :style="mobileFilterStyle"
            >
                <ActivityFilterChips
                    :filters="filters"
                    :active="activeFilter"
                    @select="selectFilter($event as ActivityFilter)"
                />
            </div>
            <div
                role="tabpanel"
                class="isolate min-h-[calc(100dvh+18rem)] xl:min-h-0"
            >
                <component :is="panels[activeFilter]" />
            </div>
        </div>
    </BasePage>
</template>
