<script setup lang="ts">
import { ApiLiveQuery, DocType, type ApiSearchQuery, type GroupDto } from "luminary-shared";
import LCard from "../common/LCard.vue";
import GroupRow from "./GroupRow.vue";
import { ref, watch } from "vue";

const groups = ref<GroupDto[] | undefined>([]);
const accessToGroup = ref<GroupDto[]>([]);

const groupsQuery = ref<ApiSearchQuery>({
    types: [DocType.Group],
});
const apiGroup = new ApiLiveQuery<GroupDto>(groupsQuery);

const apiGroupResults = apiGroup.toArrayAsRef();

watch(
    apiGroupResults,
    () => {
        if (!apiGroupResults.value) {
            return;
        }

        groups.value = apiGroupResults.value;

        // Step 1: Collect all unique groupIds from ACLs
        const aclGroupIds = new Set(
            groups.value.flatMap((group) => group.acl.map((a) => a.groupId)).filter(Boolean),
        );

        // Step 2: Filter groups that are referenced in the ACLs
        accessToGroup.value = groups.value.filter((group) => aclGroupIds.has(group._id));
    },
    { immediate: true },
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

                            <!-- status -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
                            ></th>

                            <!-- Have accessTo -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                                @click="false"
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
                        <GroupRow
                            v-for="group in groups"
                            :key="group._id"
                            :groupsDoc="group"
                            :accessToGroup="accessToGroup"
                        />
                    </tbody>
                </table>
            </div>
        </div>
    </LCard>
</template>
