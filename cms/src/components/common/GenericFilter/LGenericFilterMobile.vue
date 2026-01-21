<script setup lang="ts" generic="T">
import { MagnifyingGlassIcon } from "@heroicons/vue/24/outline";
import type { GenericFilterConfig, GenericQueryOptions, FilterFieldConfig } from "./types";
import { ref } from "vue";
import LRadio from "@/components/forms/LRadio.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LModal from "@/components/modals/LModal.vue";
import { AdjustmentsVerticalIcon } from "@heroicons/vue/20/solid";

type Props = {
    config: GenericFilterConfig<T> & { fields: FilterFieldConfig<T>[] };
    reset: () => void;
};

defineProps<Props>();

const queryOptions = defineModel<GenericQueryOptions<T>>("queryOptions", { required: true });
const query = defineModel("query", { required: true });

const showFilters = ref(false);
</script>

<template>
    <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 border-b border-t border-zinc-300 bg-white p-4 shadow">
            <!-- Search -->
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="query as string"
                :full-height="true"
                class="flex-grow"
            />

            <!-- Filter Button -->
            <LButton
                @click="showFilters = true"
                variant="secondary"
                class="size-10 px-0"
                title="Filters"
            >
                <AdjustmentsVerticalIcon class="h-5 w-5 text-zinc-400" />
            </LButton>

            <LModal v-model:isVisible="showFilters" heading="Filter options">
                <div class="flex flex-col gap-4 py-4">
                    <!-- Filters -->
                    <div class="flex flex-col gap-3">
                        <slot name="filters" :options="queryOptions" />

                        <div v-if="config.selectFilters?.length">
                            <div
                                v-for="filter in config.selectFilters"
                                :key="filter.key"
                                class="flex flex-col gap-1"
                            >
                                <label class="text-sm font-medium text-zinc-900">{{
                                    filter.label
                                }}</label>
                                <LSelect
                                    data-test="filter-select"
                                    v-model="queryOptions[filter.key]"
                                    :options="filter.options"
                                    :placeholder="filter.label || 'Select...'"
                                    class="w-full"
                                />
                            </div>
                        </div>
                    </div>

                    <hr v-if="config.fields.some((f) => typeof f === 'object' && f.sortable)" />

                    <!-- Sort -->
                    <div
                        class="flex flex-col gap-3"
                        v-if="config.fields.some((f) => typeof f === 'object' && f.sortable)"
                    >
                        <h3 class="text-sm font-medium text-zinc-900">Sort By</h3>

                        <LSelect
                            v-model="queryOptions.orderBy"
                            :options="
                                config.fields
                                    .filter(
                                        (f): f is FilterFieldConfig<T> =>
                                            typeof f === 'object' && !!f.sortable,
                                    )
                                    .map((f) => ({
                                        value: String(f.key),
                                        label: f.label as string,
                                    }))
                            "
                            class="w-full"
                        />

                        <div class="flex gap-4">
                            <LRadio
                                label="Ascending"
                                value="asc"
                                name="sortDirection"
                                v-model="queryOptions.orderDirection"
                            />
                            <LRadio
                                label="Descending"
                                value="desc"
                                name="sortDirection"
                                v-model="queryOptions.orderDirection"
                            />
                        </div>
                    </div>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-2">
                        <LButton variant="secondary" @click="reset"> Reset </LButton>
                        <LButton variant="primary" @click="showFilters = false">
                            Show Results
                        </LButton>
                    </div>
                </template>
            </LModal>
        </div>
        <div class="flex flex-wrap gap-2 px-4 empty:hidden">
            <slot name="active-filters" :options="queryOptions" />
        </div>
    </div>
</template>
