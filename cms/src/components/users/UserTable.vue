<script setup lang="ts">
import { type UserDto, isConnected, type GroupDto } from "luminary-shared";
import LCard from "../common/LCard.vue";
import UserRow from "../users/UserRow.vue";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import { userOverviewQuery, type userOverviewQueryOptions } from "../content/query";
import LPaginator from "../common/LPaginator.vue";

type Props = {
    queryOptions: userOverviewQueryOptions;
    groups: GroupDto[];
};

const props = defineProps<Props>();

const pageIndex = defineModel<number>("pageIndex", {
    required: true,
});

const userDocs = userOverviewQuery(props.queryOptions);
const userDocsTotal = userOverviewQuery({ ...props.queryOptions, count: true });
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto rounded-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50" v-if="!userDocs.isLoading && isConnected">
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
                    <tbody class="divide-y divide-zinc-200 bg-white" v-if="isConnected">
                        <UserRow
                            v-for="user in userDocs.users"
                            :key="user._id"
                            :usersDoc="user as UserDto"
                            :groups="groups.filter((group) => user.memberOf?.includes(group._id))"
                        />
                    </tbody>
                </table>
                <div
                    class="flex h-32 w-full items-center justify-center gap-2"
                    v-if="(userDocs.users && userDocs.users?.length < 1) || !userDocs"
                >
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                    <p class="text-sm text-zinc-500">No content found with the matched filter.</p>
                </div>

                <div
                    class="flex h-32 w-full items-center justify-center gap-2"
                    v-if="userDocs.isLoading"
                >
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
    <div class="flex h-14 w-full items-center justify-center py-4">
        <LPaginator
            :amountOfDocs="userDocsTotal?.count as number"
            v-model:index="pageIndex"
            v-model:page-size="queryOptions.pageSize as number"
            variant="extended"
        />
    </div>
</template>
