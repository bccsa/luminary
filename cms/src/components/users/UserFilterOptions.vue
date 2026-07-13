<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { ref, watch } from "vue";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import UserFilterOptionsMobile from "./UserFilterOptionsMobile.vue";
import UserFilterOptionsDesktop from "./UserFilterOptionsDesktop.vue";

export type UserOverviewQueryOptions = {
    groups?: string[];
    search?: string;
};

type FilterOptionsProps = {
    groups: GroupDto[];
    isSmallScreen?: boolean;
};

withDefaults(defineProps<FilterOptionsProps>(), {
    isSmallScreen: false,
});

const queryOptions = defineModel<UserOverviewQueryOptions>("queryOptions", { required: true });

const searchTerm = ref(queryOptions.value.search || "");
const search = () => {
    if (!searchTerm.value) return;
    if (searchTerm.value.length >= 3 || searchTerm.value.length === 0) {
        queryOptions.value.search = searchTerm.value;
    }
};
const showSearchButton = ref(false);
const showResetButton = ref(false);

const clearSearch = () => {
    queryOptions.value.search = "";
    searchTerm.value = "";
    showSearchButton.value = false;
    showResetButton.value = false;
};

const resetQueryOptions = () => {
    queryOptions.value = {
        groups: [],
        search: "",
    };
    searchTerm.value = "";
    showSearchButton.value = false;
    showResetButton.value = false;
};

watch(
    () => searchTerm.value,
    (newVal) => {
        if (!newVal || newVal.length === 0) {
            clearSearch();
            return;
        }
        if (newVal.length >= 3) {
            showSearchButton.value = true;
            showResetButton.value = true;
        } else showSearchButton.value = false;
    },
);
</script>

<template>
    <UserFilterOptionsMobile
        v-if="isSmallScreen"
        :groups="groups"
        v-model:query="searchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :search="search"
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
    </UserFilterOptionsMobile>
    <UserFilterOptionsDesktop
        v-else
        :groups="groups"
        v-model:query="searchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :search="search"
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
    </UserFilterOptionsDesktop>
</template>
