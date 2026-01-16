<script setup lang="ts" generic="T">
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    ArrowUturnLeftIcon,
} from "@heroicons/vue/24/outline";
import type { GenericFilterConfig, GenericQueryOptions, FilterFieldConfig } from "./types";
import { ref } from "vue";
import LRadio from "@/components/forms/LRadio.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import { onClickOutside } from "@vueuse/core";
import LDropdown from "@/components/common/LDropdown.vue";

type Props = {
    config: GenericFilterConfig<T> & { fields: FilterFieldConfig<T>[] };
    reset: () => void;
};

defineProps<Props>();

const queryOptions = defineModel<GenericQueryOptions<T>>("queryOptions", { required: true });
const query = defineModel("query", { required: true });

const sortOptionsMenu = ref(undefined);
const showSortOptions = ref(false);

onClickOutside(sortOptionsMenu, () => {
    showSortOptions.value = false;
});
</script>

<template>
    <div class="flex flex-col gap-2 border-b border-t border-zinc-300 bg-white p-4 shadow">
        <!-- Search -->
        <LInput
            type="text"
            :icon="MagnifyingGlassIcon"
            name="search"
            placeholder="Search..."
            data-test="search-input"
            v-model="query as string"
            :full-height="true"
        />

        <!-- Filters -->
        <div class="flex flex-col gap-2">
            <LSelect
                v-for="filter in config.selectFilters"
                :key="filter.key"
                data-test="filter-select"
                v-model="queryOptions[filter.key]"
                :options="filter.options"
            />
        </div>

        <!-- Sort -->
        <div class="relative">
            <LButton
                @click="showSortOptions = !showSortOptions"
                data-test="sort-toggle-btn"
                class="w-full"
            >
                <ArrowsUpDownIcon class="mr-2 h-4 w-4" />
                Sort Options
            </LButton>
            <div class="absolute left-0 top-12 z-10">
                <LDropdown
                    ref="sortOptionsMenu"
                    :show="showSortOptions"
                    data-test="sort-options-display"
                    padding="medium"
                >
                    <div class="flex flex-col">
                        <LRadio
                            v-for="field in config.fields.filter((f) => f.sortable)"
                            :key="String(field.key)"
                            :label="field.label"
                            :value="field.key"
                            v-model="queryOptions.orderBy"
                            :data-test="`sort-option-${String(field.key)}`"
                        />
                    </div>
                    <hr class="my-2" />
                    <div class="flex flex-col gap-1">
                        <LButton
                            class="flex justify-stretch"
                            data-test="ascending-sort-toggle"
                            :class="
                                queryOptions.orderDirection == 'asc' ? 'bg-zinc-100' : 'bg-white'
                            "
                            :icon="ArrowUpIcon"
                            @click="queryOptions.orderDirection = 'asc'"
                            >Ascending</LButton
                        >
                        <LButton
                            class="flex justify-stretch"
                            data-test="descending-sort-toggle"
                            :class="
                                queryOptions.orderDirection == 'desc' ? 'bg-zinc-100' : 'bg-white'
                            "
                            variant="secondary"
                            :icon="ArrowDownIcon"
                            @click="queryOptions.orderDirection = 'desc'"
                            >Descending</LButton
                        >
                    </div>
                </LDropdown>
            </div>
        </div>

        <!-- Reset -->
        <LButton @click="reset()" class="w-full">
            <ArrowUturnLeftIcon class="mr-2 h-4 w-4" />
            Reset Filters
        </LButton>
    </div>
</template>
