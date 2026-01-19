<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserTable from "@/components/users/UserTable.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    type GroupDto,
    useDexieLiveQuery,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";
import UserFilterOptions, { type UserOverviewQueryOptions } from "./UserFilterOptions.vue";
import LPaginator from "@/components/common/LPaginator.vue";

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));

const createNew = () => {
    router.push({ name: "user", params: { id: db.uuid() } });
};

const defaultQueryOptions: UserOverviewQueryOptions = {
    groups: [],
    search: "",
    pageSize: 20,
    pageIndex: 0,
};

const savedQueryOptions = () => sessionStorage.getItem("userOverviewQueryOptions");

function mergeNewFields(saved: string | null): UserOverviewQueryOptions {
    const parsed = saved ? JSON.parse(saved) : {};
    return {
        ...defaultQueryOptions,
        ...parsed,
        groups: parsed.groups ?? [],
        pageSize: parsed.pageSize ?? 20,
        pageIndex: parsed.pageIndex ?? 0,
    };
}

const queryOptions = ref<UserOverviewQueryOptions>(
    mergeNewFields(savedQueryOptions()) as UserOverviewQueryOptions,
);

watch(
    queryOptions,
    () => {
        sessionStorage.setItem("userOverviewQueryOptions", JSON.stringify(queryOptions.value));
    },
    { deep: true },
);

// Reset to first page when search or groups change
watch([() => queryOptions.value.search, () => queryOptions.value.groups], () => {
    queryOptions.value.pageIndex = 0;
});

const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

const totalUsers = ref(0);
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
        <template #internalPageHeader>
            <UserFilterOptions
                :is-small-screen="isSmallScreen"
                :groups="groups"
                v-model:query-options="queryOptions"
            />
        </template>
        <p class="mb-4 p-2 text-gray-500">
            Users only need to be created when they require special permissions that are not already
            automatically granted. It's possible to add multiple user objects with the same email
            address. This allows different administrators to independently assign access to the same
            individual for different groups they manage.
        </p>
        <UserTable :query-options="queryOptions" @update:total="totalUsers = $event" />
        <template #footer>
            <div class="w-full sm:px-8">
                <LPaginator
                    :amountOfDocs="totalUsers"
                    v-model:index="queryOptions.pageIndex as number"
                    v-model:page-size="queryOptions.pageSize as number"
                    variant="extended"
                />
            </div>
        </template>
    </BasePage>
</template>
