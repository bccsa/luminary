<script setup lang="ts" generic="T">
import { ref, computed } from "vue";
import { debouncedWatch } from "@vueuse/core";
import type { GenericFilterConfig, GenericQueryOptions } from "./types";
import { normalizeFieldConfig } from "./types";
import GenericFilterDesktop from "./GenericFilterDesktop.vue";
import GenericFilterMobile from "./GenericFilterMobile.vue";

type Props = {
    config: GenericFilterConfig<T>;
    isSmallScreen?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
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
    const newOptions: GenericQueryOptions<T> = {
        orderBy: props.config.defaultOrderBy,
        orderDirection: props.config.defaultOrderDirection ?? "desc",
        pageSize: props.config.pageSize ?? 20,
        pageIndex: 0,
        search: "",
    };

    // Reset custom select filters to default values
    props.config.selectFilters?.forEach((filter) => {
        newOptions[filter.key] = filter.defaultValue ?? filter.options[0]?.value;
    });

    queryOptions.value = newOptions;
    debouncedSearchTerm.value = "";
};
</script>

<template>
    <GenericFilterMobile
        v-if="isSmallScreen"
        :config="normalizedConfig"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
    />
    <GenericFilterDesktop
        v-else
        :config="normalizedConfig"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
    />
</template>
