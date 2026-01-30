<script setup lang="ts" generic="T">
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    ArrowUturnLeftIcon,
    XMarkIcon,
} from "@heroicons/vue/24/outline";
import { ref, toRef, nextTick, watch, computed } from "vue";
import type { GenericFilterConfig, GenericQueryOptions, FilterFieldConfig } from "./types";
import LRadio from "@/components/forms/LRadio.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import { onClickOutside, useElementBounding } from "@vueuse/core";
import LDropdown from "@/components/common/LDropdown.vue";

const props = defineProps<{
    config: GenericFilterConfig<T>;
    queryOptions: GenericQueryOptions<T>;
    reset: () => void;
}>();

const queryOptions = toRef(props, "queryOptions");
const query = defineModel("query", { required: true });

const sortOptionsMenu = ref(undefined);
const showSortOptions = ref(false);

const showSearch = ref(!!queryOptions.value.search);
const searchInput = ref<InstanceType<typeof LInput> | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementBounding(containerRef);
const MIN_SEARCH_WIDTH = 250;
const GAP_AND_PADDING = 64; // px-8 (32*2) + gap-1 (4) approx
const CONTROLS_BASE_WIDTH = 200; // sort, reset, slot estimate

const isTight = computed(() => {
    if (!containerWidth.value) return false;
    // Heuristic: Estimate required width for controls to avoid layout loops
    // Selects (160px) + Base (200px) + Padding (64px)
    const selectsCount = props.config.selectFilters?.length || 0;
    const requiredControlsWidth = selectsCount * 160 + CONTROLS_BASE_WIDTH;

    // Available space for search
    const available = containerWidth.value - requiredControlsWidth - GAP_AND_PADDING;
    return available < MIN_SEARCH_WIDTH;
});

watch(
    isTight,
    (tight) => {
        // Only auto-collapse/expand if query is empty
        if (!query.value) {
            showSearch.value = !tight;
        }
    },
    { immediate: true },
);

const toggleSearch = async () => {
    showSearch.value = !showSearch.value;
    if (showSearch.value) {
        await nextTick();
        searchInput.value?.$el.querySelector("input")?.focus();
    }
};

onClickOutside(sortOptionsMenu, () => {
    showSortOptions.value = false;
});
</script>

<template>
    <div
        class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white py-1 shadow"
    >
        <div ref="containerRef" class="flex w-full items-center gap-1 px-8 py-1">
            <!-- Collapsible Search -->
            <div
                class="flex items-center transition-all duration-200 ease-in-out"
                :class="showSearch ? 'flex-grow' : 'flex-none'"
            >
                <LButton
                    v-if="!showSearch"
                    variant="tertiary"
                    @click="toggleSearch"
                    data-test="search-toggle-btn"
                    class="h-[38px] w-10 text-zinc-500 hover:text-zinc-700"
                    title="Search"
                >
                    <MagnifyingGlassIcon class="h-5 w-5" />
                </LButton>

                <div v-if="showSearch" class="relative flex w-full items-center">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="w-full"
                        name="search"
                        placeholder="Search..."
                        data-test="search-input"
                        ref="searchInput"
                        v-model="query as string"
                        @blur="
                            () => {
                                if (!query && isTight) showSearch = false;
                            }
                        "
                        @keydown.esc="
                            () => {
                                query = '';
                                if (isTight) showSearch = false;
                                else showSearch = false;
                            }
                        "
                        :full-height="true"
                    />
                    <button
                        v-if="query"
                        @click="query = ''"
                        class="absolute right-2 text-zinc-400 hover:text-zinc-600"
                    >
                        <XMarkIcon class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div
                ref="controlsRef"
                class="relative flex flex-shrink-0 items-center gap-1"
                :class="{ 'flex-grow': !showSearch }"
            >
                <!-- Custom select filters -->
                <LSelect
                    v-for="filter in config.selectFilters"
                    :key="filter.key"
                    class="min-w-[10rem] flex-1"
                    data-test="filter-select"
                    v-model="queryOptions[filter.key]"
                    :options="filter.options"
                />

                <!-- Custom filter slot for per-overview filter UI -->
                <slot name="filters" :options="queryOptions" />

                <!-- Sort button and dropdown -->
                <LButton
                    @click="showSortOptions = !showSortOptions"
                    data-test="sort-toggle-btn"
                    class="h-[38px]"
                >
                    <ArrowsUpDownIcon class="h-full w-4" />
                </LButton>
                <div class="absolute right-0 top-4">
                    <LDropdown
                        ref="sortOptionsMenu"
                        :show="showSortOptions"
                        data-test="sort-options-display"
                        padding="medium"
                    >
                        <div class="flex flex-col">
                            <LRadio
                                v-for="field in config.fields.filter(
                                    (f): f is FilterFieldConfig<T> =>
                                        typeof f === 'object' && 'sortable' in f && !!f.sortable,
                                )"
                                :key="String(field.key)"
                                :label="field.label as string"
                                :value="String(field.key)"
                                v-model="queryOptions.orderBy as string"
                                :data-test="`sort-option-${String(field.key)}`"
                            />
                        </div>
                        <hr class="my-2" />
                        <div class="flex flex-col gap-1">
                            <LButton
                                class="flex justify-stretch"
                                data-test="ascending-sort-toggle"
                                :class="
                                    queryOptions.orderDirection == 'asc'
                                        ? 'bg-zinc-100'
                                        : 'bg-white'
                                "
                                :icon="ArrowUpIcon"
                                @click="queryOptions.orderDirection = 'asc'"
                                >Ascending</LButton
                            >
                            <LButton
                                class="flex justify-stretch"
                                data-test="descending-sort-toggle"
                                :class="
                                    queryOptions.orderDirection == 'desc'
                                        ? 'bg-zinc-100'
                                        : 'bg-white'
                                "
                                variant="secondary"
                                :icon="ArrowDownIcon"
                                @click="queryOptions.orderDirection = 'desc'"
                                >Descending</LButton
                            >
                        </div>
                    </LDropdown>
                </div>
                <LButton @click="reset()" class="h-[38px] w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>
        <div class="flex flex-wrap gap-2 px-8 pb-1 empty:hidden">
            <slot name="active-filters" :options="queryOptions" />
        </div>
    </div>
</template>
