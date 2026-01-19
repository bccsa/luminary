<script setup lang="ts" generic="T">
import { ref, computed } from "vue";
import { debouncedWatch } from "@vueuse/core";
import type { GenericFilterConfig, GenericQueryOptions } from "./types";
import { normalizeFieldConfig } from "./types";
import GenericFilterDesktop from "./LGenericFilterDesktop.vue";
import GenericFilterMobile from "./LGenericFilterMobile.vue";

type Props = {
    config: GenericFilterConfig<T>;
    isSmallScreen?: boolean;
};

const props = withDefaults(defineProps<Props & { defaultOptions?: GenericQueryOptions<T> }>(), {
    isSmallScreen: false,
});

const queryOptions = defineModel<GenericQueryOptions<T>>("queryOptions", {
    required: true,
});

// Normalize shorthand field configurations into full config objects
const normalizedConfig = computed(() => ({
    ...props.config,
    fields: props.config.fields.map((field) => normalizeFieldConfig<T>(field)),
}));

const debouncedSearchTerm = ref(queryOptions.value.search ?? "");

debouncedWatch(
    debouncedSearchTerm,
    () => {
        queryOptions.value.search = debouncedSearchTerm.value;
    },
    { debounce: 500 },
);

const resetQueryOptions = () => {
    // Start with provided defaults or minimal defaults
    const newOptions: GenericQueryOptions<T> = props.defaultOptions
        ? { ...props.defaultOptions }
        : {
              orderBy: props.config.defaultOrderBy,
              orderDirection: props.config.defaultOrderDirection ?? "desc",
              pageSize: props.config.pageSize ?? 20,
              pageIndex: 0,
              search: "",
              customFilters: undefined,
          };

    // If using internal logic, we might want to respect config defaults for selects too?
    // But if defaultOptions is provided, it should include those defaults.
    // If NOT provided, we apply select defaults:
    if (!props.defaultOptions) {
        props.config.selectFilters?.forEach((filter) => {
            newOptions[filter.key] = filter.defaultValue ?? filter.options[0]?.value;
        });
    } else {
        // Even with defaults, ensure we reset the search term if desired (usually yes)
        newOptions.search = "";
    }

    queryOptions.value = newOptions;
    debouncedSearchTerm.value = "";
};

// Expose slot props for custom filter UI
// This is a reactive proxy that allows slot content to mutate customFilters
const filterSlotProps = computed(() => ({
    options: queryOptions,
}));
</script>

<template>
    <GenericFilterMobile
        v-if="isSmallScreen"
        :config="normalizedConfig"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
    >
        <template #filters="slotProps">
            <slot name="filters" v-bind="{ ...slotProps, ...filterSlotProps }" />
        </template>
        <template #active-filters="slotProps">
            <slot name="active-filters" v-bind="{ ...slotProps, ...filterSlotProps }" />
        </template>
    </GenericFilterMobile>
    <GenericFilterDesktop
        v-else
        :config="normalizedConfig"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
    >
        <template #filters="slotProps">
            <slot name="filters" v-bind="{ ...slotProps, ...filterSlotProps }" />
        </template>
        <template #active-filters="slotProps">
            <slot name="active-filters" v-bind="{ ...slotProps, ...filterSlotProps }" />
        </template>
    </GenericFilterDesktop>
</template>
