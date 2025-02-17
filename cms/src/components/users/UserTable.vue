<script setup lang="ts">
import { DocType, getRest, type ApiSearchQuery, type UserDto } from "luminary-shared";
import LCard from "../common/LCard.vue";
import UserRow from "../users/UserRow.vue";
import { computed, provide, ref, watch } from "vue";

const usersQuery: ApiSearchQuery = {
    types: [DocType.User],
};

const users = ref<Map<string, UserDto>>(new Map());
provide("users", users);

const getDbUsers = async () => {
    const _s = Object.fromEntries(users.value);
    const latest = Object.values(_s).reduce((acc, curr) => {
        return curr.updatedTimeUtc > acc ? curr.updatedTimeUtc : acc;
    }, 0);

    latest ? (usersQuery.from = latest) : delete usersQuery.from;
    const _q = await getRest().search(usersQuery);
    _q &&
        _q.docs &&
        _q.docs.forEach((d: UserDto) => {
            users.value.set(d._id, d);
        });
};
getDbUsers();

// poll api every 5 seconds for updates
setInterval(getDbUsers, 5000);

const newUsers = ref<UserDto[]>([]);

const combinedUsers = computed(() => {
    const _s = Object.fromEntries(users.value);
    return newUsers.value.concat(Object.values(_s));
});

// Remove saved new users from newUsers
watch(
    [newUsers, users],
    async () => {
        const _s = Object.fromEntries(users.value);
        const duplicates = newUsers.value.filter((u) =>
            Object.values(_s).some((dbG) => dbG._id === u._id),
        );
        for (const duplicate of duplicates) {
            newUsers.value.splice(newUsers.value.indexOf(duplicate), 1);
        }
    },
    { deep: true },
);
</script>

<template>
    <LCard padding="none">
        <div class="overflow-x-auto rounded-md">
            <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
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
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            >
                                Member of
                            </th>

                            <!-- is Local Change -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            ></th>

                            <!-- updated -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                                @click="false"
                            >
                                <div class="flex items-center gap-2">Last updated</div>
                            </th>

                            <!-- actions -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            ></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-200 bg-white">
                        <UserRow v-for="user in combinedUsers" :key="user._id" :usersDoc="user" />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
