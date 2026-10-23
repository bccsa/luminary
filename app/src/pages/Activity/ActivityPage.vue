<script lang="ts" setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import { markPageReady } from "@/util/renderState";
import type { HighlightColor } from "luminary-shared";
import ActivityFilterChips from "./ActivityFilterChips.vue";
import ActivityColourChips from "./ActivityColourChips.vue";
import { useHighlightColours } from "./useHighlightColours";
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

// Not mirrored to the query string: where that state should live is still to be decided.
const colour = ref<HighlightColor | undefined>(undefined);
const colours = useHighlightColours();
// A single colour needs no filter: the chips would only state what is shown.
const showColours = computed(
    () => activeFilter.value === "highlighted" && colours.value.length > 1,
);
// A colour whose last highlight went away would otherwise leave the list empty with no way out.
watch(colours, (available) => {
    if (colour.value && !available.includes(colour.value)) colour.value = undefined;
});
const panelProps = computed(() =>
    activeFilter.value === "highlighted" ? { colour: colour.value } : {},
);

// The strip is pinned at the scrollport edge. While the top bar shows it is pushed down below
// it; on scroll down it slides off the top with the bars. A transform on the same timeline as
// theirs keeps them in lockstep, where animating `top` would lag behind mid-scroll.
const mobileFilterStyle = computed(() => ({
    transform: mobileChrome.hidden.value
        ? "translateY(-100%)"
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
            <!-- Mobile. Steps off the top with the top and bottom bars on scroll down, and returns with
                 them on scroll up. Inert meanwhile, so its off-screen chips can't take focus. -->
            <div
                class="sticky top-0 z-10 -mx-2 -mt-[var(--top-bar-h,74px)] mb-[var(--top-bar-h,74px)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform xl:hidden"
                :style="mobileFilterStyle"
                :inert="mobileChrome.hidden.value"
            >
                <div
                    class="relative z-10 bg-white px-2 py-3 before:absolute before:inset-x-0 before:bottom-full before:h-2 before:bg-inherit dark:bg-slate-900"
                >
                    <ActivityFilterChips
                        :filters="filters"
                        :active="activeFilter"
                        @select="selectFilter($event as ActivityFilter)"
                    />
                </div>
                <div
                    v-if="showColours"
                    class="bg-white px-2 pb-3 pt-1 dark:bg-slate-900"
                >
                    <ActivityColourChips
                        :colours="colours"
                        :active="colour"
                        @select="colour = $event"
                    />
                </div>
            </div>

            <!-- xl: the section chips sit in the pinned strip above, so the colours pin right under
                 it. Like those chips, no backing: only the pills themselves. -->
            <div
                v-if="showColours"
                class="sticky top-11 z-10 -mx-2 mb-4 hidden px-2 pb-2 xl:block xl:pl-10"
            >
                <ActivityColourChips
                    :colours="colours"
                    :active="colour"
                    @select="colour = $event"
                />
            </div>
            <div
                role="tabpanel"
                class="isolate min-h-[calc(100dvh+18rem)] xl:min-h-0"
            >
                <component
                    :is="panels[activeFilter]"
                    v-bind="panelProps"
                />
            </div>
        </div>
    </BasePage>
</template>
