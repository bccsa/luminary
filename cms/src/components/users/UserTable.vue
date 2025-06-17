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

const usersQuery = ref<ApiSearchQuery>({
    types: [DocType.User],
});

const apiLiveQuery = new ApiLiveQuery<UserDto>(usersQuery);
const users = apiLiveQuery.toArrayAsRef();
const isLoading = apiLiveQuery.isLoadingAsRef();

const newUsers = ref<UserDto[]>([]);

const combinedUsers = computed(() => {
    if (users.value && users.value.length && newUsers.value)
        return newUsers.value.concat(users.value);
    if (newUsers.value) return newUsers.value;
    return [];
});

// Remove duplicates from newUsers
watch(
    [newUsers, users],
    async () => {
        if (!users.value || !newUsers.value) return;
        const duplicates = newUsers.value.filter((u) =>
            users.value?.some((user) => user._id === u._id),
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
                                <div class="flex items-center gap-2">Last Logged In</div>
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
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                    <p class="text-sm text-zinc-500">Loading...</p>
                </div>
                <div class="flex h-32 w-full items-center justify-center gap-2" v-if="!isConnected">
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                    <p class="text-sm text-zinc-500">Offline</p>
                </div>
            </div>
        </div>
    </LCard>
</template>
