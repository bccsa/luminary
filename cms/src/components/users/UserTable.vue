<script setup lang="ts">
import {
    DocType,
    type ApiSearchQuery,
    type UserDto,
    ApiLiveQuery,
    isConnected,
} from "luminary-shared";
import LCard from "../common/LCard.vue";
import UserRow from "../users/UserRow.vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import LoadingBar from "../LoadingBar.vue";
import { type UserOverviewQueryOptions } from "./UserFilterOptions.vue";

type Props = {
    queryOptions?: UserOverviewQueryOptions;
};

const props = withDefaults(defineProps<Props>(), {
    queryOptions: () => ({ groups: [], search: "" }),
});

const emit = defineEmits<{
    "update:total": [value: number];
}>();

// Note: ApiLiveQuery doesn't support groups or queryString, so we do client-side filtering
const usersQuery = ref<ApiSearchQuery>({
    types: [DocType.User],
});

const apiLiveQuery = new ApiLiveQuery<UserDto>(usersQuery);
const users = apiLiveQuery.toArrayAsRef();
const isLoading = apiLiveQuery.isLoadingAsRef();

// Apply client-side filtering (ApiLiveQuery doesn't support groups or queryString)
const filteredUsers = computed(() => {
    let result = users.value || [];

    // Apply search filter
    if (props.queryOptions.search) {
        const searchLower = props.queryOptions.search.toLowerCase();
        result = result.filter(
            (user) =>
                user.name?.toLowerCase().includes(searchLower) ||
                user.email?.toLowerCase().includes(searchLower),
        );
    }

    // Apply group filter
    if (props.queryOptions.groups && props.queryOptions.groups.length > 0) {
        result = result.filter((user) =>
            props.queryOptions.groups?.some((groupId) => user.memberOf?.includes(groupId)),
        );
    }

    return result;
});

// Total count for paginator
const totalUsers = computed(() => filteredUsers.value.length);

// Emit total count for paginator
watch(
    totalUsers,
    (newTotal) => {
        emit("update:total", newTotal);
    },
    { immediate: true },
);

const newUsers = ref<UserDto[]>([]);

// Apply pagination
const paginatedUsers = computed(() => {
    const pageSize = props.queryOptions.pageSize || 20;
    const pageIndex = props.queryOptions.pageIndex || 0;
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return filteredUsers.value.slice(start, end);
});

const combinedUsers = computed(() => {
    // Combine newUsers with paginated filtered users
    // Note: newUsers are shown first, then paginated results
    if (newUsers.value && newUsers.value.length) {
        return newUsers.value.concat(paginatedUsers.value);
    }
    return paginatedUsers.value || [];
});

// Remove duplicates from newUsers
watch(
    [newUsers, filteredUsers],
    async () => {
        if (!filteredUsers.value || !newUsers.value) return;
        const duplicates = newUsers.value.filter((u) =>
            filteredUsers.value?.some((user) => user._id === u._id),
        );
        for (const duplicate of duplicates) {
            newUsers.value.splice(newUsers.value.indexOf(duplicate), 1);
        }
    },
    { deep: true },
);

onBeforeUnmount(() => {
    apiLiveQuery.stopLiveQuery();
});
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto rounded-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50" v-if="!isLoading && isConnected">
                        <tr>
                            <!-- name -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Name</div>
                            </th>

                            <!-- email  -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Email</div>
                            </th>

                            <!-- memberOf -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                Member of
                            </th>

                            <!-- is Local Change -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            ></th>

                            <!-- Last Logged In -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Last logged in</div>
                            </th>

                            <!-- actions -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            ></th>
                        </tr>
                    </thead>
                    <tbody
                        class="divide-y divide-zinc-200 bg-white"
                        v-if="isConnected && !isLoading"
                    >
                        <UserRow v-for="user in combinedUsers" :key="user._id" :usersDoc="user" />
                    </tbody>
                </table>
                <div class="flex h-32 w-full items-center justify-center gap-2" v-if="isLoading">
                    <LoadingBar class="h-5 w-20 text-zinc-500" />
                </div>
                <div class="flex h-32 w-full items-center justify-center gap-2" v-if="!isConnected">
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                    <p class="text-sm text-zinc-500">Offline</p>
                </div>
            </div>
        </div>
    </LCard>
</template>
