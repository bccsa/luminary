<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserTable from "@/components/users/UserTable.vue";
import LButton from "@/components/button/LButton.vue";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    useDexieLiveQuery,
    type GroupDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import type { userOverviewQueryOptions } from "../content/query";
import { debouncedWatch, onClickOutside } from "@vueuse/core";
import LInput from "../forms/LInput.vue";
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    ArrowUturnLeftIcon,
    UserGroupIcon,
} from "@heroicons/vue/24/outline";
import LCombobox from "../forms/LCombobox.vue";
import LRadio from "../forms/LRadio.vue";
import { Menu } from "@headlessui/vue";
import LTag from "../content/LTag.vue";

const defaultQueryOptions: userOverviewQueryOptions = {
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    pageSize: 20,
    pageIndex: 0,
    search: "",
    groups: [],
};

const savedQueryOptions = () => sessionStorage.getItem(`userOverviewQueryOptions`);

function mergeNewFields(saved: string | null): userOverviewQueryOptions {
    const parsed = saved ? JSON.parse(saved) : {};
    return {
        ...defaultQueryOptions,
        ...parsed,
        groups: parsed.groups ?? [],
    };
}

const queryOptions = ref<userOverviewQueryOptions>(
    mergeNewFields(savedQueryOptions()) as userOverviewQueryOptions,
);

watch(
    queryOptions,
    () => {
        sessionStorage.setItem(`userOverviewQueryOptions`, JSON.stringify(queryOptions.value));
    },
    { deep: true },
);

const tableRefreshKey = computed(() => JSON.stringify(queryOptions.value));

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));

const sortOptionsMenu = ref(undefined);
const showSortOptions = ref(false);

const debouncedSearchTerm = ref(queryOptions.value.search);
debouncedWatch(
    debouncedSearchTerm,
    () => {
        queryOptions.value.search = debouncedSearchTerm.value;
    },
    { debounce: 500 },
);

onClickOutside(sortOptionsMenu, () => {
    showSortOptions.value = false;
});

const resetQueryOptions = () => {
    queryOptions.value = {
        orderBy: "updatedTimeUtc",
        orderDirection: "desc",
        pageSize: 20,
        pageIndex: 0,
        search: "",
        groups: [],
    };
    debouncedSearchTerm.value = "";
};

const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);
</script>

<template>
    <BasePage :is-full-width="true" title="User overview" :should-show-page-title="false">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="$router.push({ name: 'user', params: { id: db.uuid() } })"
                    name="createUserBtn"
                >
                    Create user
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-6 w-6 text-zinc-500"
                    @click="createNew"
                />
            </div>
        </template>
        <p class="mb-4 p-2 text-gray-500">
            Users only need to be created when they require special permissions that are not already
            automatically granted. It's possible to add multiple user objects with the same email
            address. This allows different administrators to independently assign access to the same
            individual for different groups they manage.
        </p>
        <div class="flex w-full gap-1 rounded-t-md bg-white p-2 shadow">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="w-96 sm:flex-grow"
                name="search-user"
                placeholder="Search..."
                data-test="user-search-input"
                v-model="debouncedSearchTerm"
                :full-height="true"
            />

            <div>
                <div class="relative flex gap-1">
                    <LCombobox
                        v-model:selectedOptions="queryOptions.groups as string[]"
                        :showSelectedInDropdown="false"
                        :showSelectedLabels="false"
                        :icon="UserGroupIcon"
                        :options="
                            groups.map((group: GroupDto) => ({
                                id: group._id,
                                label: group.name,
                                value: group._id,
                            }))
                        "
                    />

                    <LButton @click="() => (showSortOptions = true)" data-test="sort-options-btn">
                        <ArrowsUpDownIcon class="h-full w-4" />
                    </LButton>

                    <Menu
                        as="div"
                        ref="sortOptionsMenu"
                        class="absolute right-0 top-full mt-[2px] h-max w-40 rounded-lg bg-white p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                        v-if="showSortOptions"
                        data-test="sort-options-display"
                    >
                        <div class="flex flex-col">
                            <LRadio
                                label="Name"
                                value="name"
                                v-model="queryOptions.orderBy"
                                data-test="sort-option-name"
                            />
                            <LRadio
                                label="Last Updated"
                                value="updatedTimeUtc"
                                v-model="queryOptions.orderBy"
                                data-test="sort-option-last-updated"
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
                    </Menu>

                    <LButton @click="resetQueryOptions" class="w-10">
                        <ArrowUturnLeftIcon class="h-4 w-4" />
                    </LButton>
                </div>
            </div>
        </div>
        <div
            v-if="queryOptions.groups && queryOptions.groups?.length > 0"
            class="w-full bg-white px-2 pb-2 shadow"
        >
            <ul class="flex w-full flex-wrap gap-2">
                <LTag
                    :icon="UserGroupIcon"
                    v-for="group in queryOptions.groups"
                    :key="group"
                    @remove="
                        () => {
                            if (!queryOptions.groups) return;
                            queryOptions.groups = queryOptions.groups.filter((v) => v != group);
                        }
                    "
                >
                    {{ groups.find((g) => g._id == group)?.name }}
                </LTag>
            </ul>
        </div>
        <UserTable
            v-model:page-index="queryOptions.pageIndex as number"
            :key="tableRefreshKey"
            :groups="groups"
            :queryOptions="queryOptions"
        />
    </BasePage>
</template>
