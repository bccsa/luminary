<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { ref } from "vue";
import { debouncedWatch } from "@vueuse/core";
import UserFilterOptionsMobile from "./UserFilterOptionsMobile.vue";
import UserFilterOptionsDesktop from "./UserFilterOptionsDesktop.vue";

export type UserOverviewQueryOptions = {
    groups?: string[];
    search?: string;
    pageSize?: number;
    pageIndex?: number;
};

type FilterOptionsProps = {
    groups: GroupDto[];
    isSmallScreen?: boolean;
};

withDefaults(defineProps<FilterOptionsProps>(), {
    isSmallScreen: false,
});

const queryOptions = defineModel<UserOverviewQueryOptions>("queryOptions", { required: true });

const debouncedSearchTerm = ref(queryOptions.value.search || "");
debouncedWatch(
    debouncedSearchTerm,
    () => {
        queryOptions.value.search = debouncedSearchTerm.value;
    },
    { debounce: 500 },
);

const resetQueryOptions = () => {
    queryOptions.value = {
        groups: [],
        search: "",
        pageSize: 20,
        pageIndex: 0,
    };
    debouncedSearchTerm.value = "";
};
</script>

<template>
    <UserFilterOptionsMobile
        v-if="isSmallScreen"
        :groups="groups"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
    />
    <UserFilterOptionsDesktop
        v-else
        :groups="groups"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
    />
</template>
