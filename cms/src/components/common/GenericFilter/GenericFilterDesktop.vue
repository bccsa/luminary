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
    <div
        class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow"
    >
        <div class="flex w-full items-center gap-1 px-8 py-1">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="query as string"
                :full-height="true"
            />

            <div class="relative flex gap-1">
                <!-- Custom select filters -->
                <LSelect
                    v-for="filter in config.selectFilters"
                    :key="filter.key"
                    data-test="filter-select"
                    v-model="queryOptions[filter.key]"
                    :options="filter.options"
                />

                <!-- Sort button and dropdown -->
                <LButton @click="showSortOptions = !showSortOptions" data-test="sort-toggle-btn">
                    <ArrowsUpDownIcon class="h-full w-4" />
                </LButton>
                <div class="absolute right-0 top-12">
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
                <LButton @click="reset()" class="w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>
    </div>
</template>
