<script setup lang="ts">
import GroupFilterOptionsDesktop from "./GroupFilterOptionsDesktop.vue";
import GroupFilterOptionsMobile from "./GroupFilterOptionsMobile.vue";
import { type GroupOverviewQueryOptions } from "./GroupOverview/types.js";
import { type GroupDto } from "luminary-shared";
import { ref, watch } from "vue";
import { XMarkIcon } from "@heroicons/vue/20/solid";

type FilterOptionsProps = {
    groups: GroupDto[];
    isSmallScreen?: boolean;
    reset: Function;
};

const applySearch = defineModel<Function>("applySearch", { required: false });
withDefaults(defineProps<FilterOptionsProps>(), {
    isSmallScreen: false,
});

const queryOptions = defineModel<GroupOverviewQueryOptions>("queryOptions", { required: true });
const query = defineModel<string>("query", { required: true });

const showSearchButton = ref(false);
const showResetButton = ref(false);

const search = () => {
    if (!query.value || query.value.length === 0) {
        queryOptions.value.search = "";
        applySearch.value?.();
        return;
    }
    queryOptions.value.search = query.value;
    applySearch.value?.();
};

const clearSearch = () => {
    queryOptions.value.search = "";
    query.value = "";
    showSearchButton.value = false;
    showResetButton.value = false;
};

watch(
    () => query.value,
    (newVal) => {
        if (!newVal || newVal.length === 0) {
            search();
            showSearchButton.value = false;
            showResetButton.value = false;
            return;
        }
        if (newVal.length > 0) {
            showSearchButton.value = true;
            showResetButton.value = true;
        }
    },
    { immediate: true },
);
</script>

<template>
    <GroupFilterOptionsMobile
        v-if="isSmallScreen"
        :groups="groups"
        v-model:query="query"
        v-model:query-options="queryOptions"
        :reset="reset"
        :search="search"
        :clear-search="clearSearch"
    >
        <template #searchButton>
            <div class="flex items-center gap-1">
                <button
                    v-if="showSearchButton"
                    type="button"
                    class="rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                    data-test="search-go-button"
                    @click="search"
                >
                    Go
                </button>
                <button
                    v-if="showResetButton"
                    type="button"
                    aria-label="Clear search"
                    @click="clearSearch"
                >
                    <XMarkIcon class="h-5 w-5 cursor-pointer text-zinc-500" />
                </button>
            </div>
        </template>
    </GroupFilterOptionsMobile>
    <GroupFilterOptionsDesktop
        v-else
        :groups="groups"
        v-model:query-options="queryOptions"
        v-model:query="query"
        :reset="reset"
        @keydown.enter="search"
        @keydown.esc="clearSearch"
    >
        <template #searchButton>
            <div class="flex items-center gap-1">
                <button
                    v-if="showSearchButton"
                    type="button"
                    class="rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                    data-test="search-go-button"
                    @click="search"
                >
                    Go
                </button>
                <button
                    v-if="showResetButton"
                    type="button"
                    aria-label="Clear search"
                    @click="clearSearch"
                >
                    <XMarkIcon class="h-5 w-5 cursor-pointer text-zinc-500" />
                </button>
            </div>
        </template>
    </GroupFilterOptionsDesktop>
</template>
