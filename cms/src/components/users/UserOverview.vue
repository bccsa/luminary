<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import UserDisplayCard from "@/components/users/UserDisplayCard.vue";
import EditUser from "@/components/users/EditUser.vue";
import UserFilterOptions, { type UserOverviewQueryOptions } from "@/components/users/UserFilterOptions.vue";
import LPaginator from "@/components/common/LPaginator.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    type UserDto,
    type ApiSearchQuery,
    ApiLiveQuery,
    type GroupDto,
    useDexieLiveQuery,
    isConnected,
} from "luminary-shared";
import { computed, ref, watch, onBeforeUnmount } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";

const canCreateNew = computed(() => hasAnyPermission(DocType.User, AclPermission.Edit));

const usersQuery = ref<ApiSearchQuery>({
    types: [DocType.User],
});

const apiLiveQuery = new ApiLiveQuery<UserDto>(usersQuery);
const users = apiLiveQuery.toArrayAsRef();

onBeforeUnmount(() => {
    apiLiveQuery.stopLiveQuery();
});

const isEditUserModalVisible = ref(false);
const isNewUserModalVisible = ref(false);
const selectedUserId = ref<string>("");

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
    <BasePage title="User overview" :should-show-page-title="false" :is-full-width="true">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew && isConnected">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isNewUserModalVisible = true"
                    name="createUserBtn"
                >
                    Create user
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-8 w-8 text-zinc-500 hover:text-zinc-700 cursor-pointer hover:bg-zinc-300 bg-zinc-100 p-1 rounded"
                    @click="isNewUserModalVisible = true"
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
        <UserDisplayCard 
            v-for="user in users" 
            :key="user._id" 
            :usersDoc="user" 
            v-model="isEditUserModalVisible" 
            @edit="(id) => selectedUserId = id"
        />
        <EditUser v-if="isEditUserModalVisible || isNewUserModalVisible"
                  :isVisible="isEditUserModalVisible || isNewUserModalVisible"
                  :id="isNewUserModalVisible ? db.uuid() : selectedUserId"
                  @close="isEditUserModalVisible = false; isNewUserModalVisible = false"
        />

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
