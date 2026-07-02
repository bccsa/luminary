<script setup lang="ts">
import GroupFilterOptionsDesktop from "./GroupFilterOptionsDesktop.vue";
import GroupFilterOptionsMobile from "./GroupFilterOptionsMobile.vue";
import { type GroupOverviewQueryOptions } from "./GroupOverview/types.js";
import { type GroupDto } from "luminary-shared";

type FilterOptionsProps = {
    groups: GroupDto[];
    isSmallScreen?: boolean;
    reset: Function;
};

withDefaults(defineProps<FilterOptionsProps>(), {
    isSmallScreen: false,
});

const queryOptions = defineModel<GroupOverviewQueryOptions>("queryOptions", { required: true });
</script>

<template>
    <GroupFilterOptionsMobile
        v-if="isSmallScreen"
        :groups="groups"
        v-model:query-options="queryOptions"
        :reset="reset"
    />
    <GroupFilterOptionsDesktop
        v-else
        :groups="groups"
        v-model:query-options="queryOptions"
        :reset="reset"
    />
</template>
