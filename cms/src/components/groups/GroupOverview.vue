<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import {
    AclPermission,
    ApiLiveQueryAsEditable,
    db,
    DocType,
    hasAnyPermission,
    type ApiSearchQuery,
    type GroupAclEntryDto,
    type GroupDto,
} from "luminary-shared";
// import EditGroup from "@/components/groups/EditGroup.vue";
import { computed, ref } from "vue";
import LCard from "@/components/common/LCard.vue";
import GroupRow from "@/components/groups/GroupRow.vue";
import { validDocTypes } from "./permissions";

const groupQuery = new ApiLiveQueryAsEditable<GroupDto>(
    ref<ApiSearchQuery>({
        types: [DocType.Group],
    }),
    {
        filterFn: (group) => {
            // Filter out empty acl entries for comparison and saving
            const filteredAcl = group.acl
                .filter((aclEntry) => aclEntry.permission.length > 0)
                .sort((a, b) => a.type.localeCompare(b.type));
            return { ...group, acl: filteredAcl };
        },
        modifyFn: (group) => {
            // Populate the acl with empty entries for types that are not set in the acl. Sort by type name.
            const aclGroupIDs = [...new Set(group.acl.map((aclEntry) => aclEntry.groupId))];
            aclGroupIDs.forEach((aclGroupId) => {
                validDocTypes
                    .filter(
                        (d) =>
                            !group.acl.some(
                                (aclEntry) =>
                                    aclEntry.type === d && aclEntry.groupId === aclGroupId,
                            ),
                    ) // Check if the type is already present
                    .forEach((docType) => {
                        // Add an empty acl entry for the missing type
                        group.acl.push({
                            groupId: aclGroupId,
                            type: docType,
                            permission: [],
                        } as GroupAclEntryDto);
                    });
            });

            group.acl.sort((a, b) => a.type.localeCompare(b.type));
            return group;
        },
    },
);

// const groups = groupQuery.liveData;
// const { isLoading, liveData, isEdited, isModified } = groupQuery;
const editable = groupQuery.editable;
const isLoading = groupQuery.isLoading;

// const groupsQuery: ApiSearchQuery = {
//     types: [DocType.Group],
// };

// const groups = ref<Map<string, GroupDto>>(new Map());
// provide("groups", groups);

// const getDbGroups = async () => {
//     const _s = Object.fromEntries(groups.value);
//     const latest = Object.values(_s).reduce((acc, curr) => {
//         return curr.updatedTimeUtc > acc ? curr.updatedTimeUtc : acc;
//     }, 0);

//     latest ? (groupsQuery.from = latest) : delete groupsQuery.from;
//     const _q = await getRest().search(groupsQuery);
//     _q &&
//         _q.docs &&
//         _q.docs.forEach((d: GroupDto) => {
//             groups.value.set(d._id, d);
//         });
// };
// getDbGroups();
// // poll api every 5 seconds for updates
// setInterval(getDbGroups, 5000);

// const newGroups = ref<GroupDto[]>([]);

// const duplicateGroup = (group: GroupDto) => {
//     newGroups.value.push(group);
// };

// const combinedGroups = computed(() => {
//     if (!groups.value) return newGroups.value;
//     return newGroups.value.concat(groups.value);
// });

// // Remove saved new groups from newGroups
// watch(
//     [newGroups, groups],
//     async () => {
//         if (!groups.value) return;
//         const duplicates = newGroups.value.filter((g) =>
//             groups.value?.some((dbG) => dbG._id === g._id),
//         );
//         for (const duplicate of duplicates) {
//             newGroups.value.splice(newGroups.value.indexOf(duplicate), 1);
//         }
//     },
//     { deep: true },
// );

const showModal = ref(false);

// const newGroupId = ref("");
// const newGroup = computed(() => {
//     return combinedGroups.value.find((g) => g._id === newGroupId.value);
// });

const createGroup = async () => {
    const newGroup = {
        _id: db.uuid(),
        type: DocType.Group,
        name: "New group",
        acl: [],
        updatedTimeUtc: Date.now(),
    } as GroupDto;

    // newGroups.value.push(newGroup);
    // newGroupId.value = newGroup._id;
    showModal.value = true;
};

const canCreateGroup = computed(() => {
    return hasAnyPermission(DocType.Group, AclPermission.Assign);
});

// const updateNewGroups = async (group: GroupDto) => {
//     const index = newGroups.value.findIndex((g) => g._id === group._id);
//     if (index !== -1) {
//         newGroups.value[index] = group;
//     } else {
//         newGroups.value.push(group);
//     }
// };
</script>

<template>
    <BasePage title="Groups" :is-full-width="true" :loading="isLoading">
        <template #actions>
            <LButton
                v-if="canCreateGroup"
                variant="primary"
                :icon="PlusIcon"
                @click="createGroup"
                data-test="createGroupButton"
            >
                Create group
            </LButton>
        </template>

        <!--GroupTable :groups="editable" /-->
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
                                v-for="(group, index) in editable"
                                :key="group._id"
                                v-model:group="editable[index]"
                                :groupQuery="groupQuery"
                            />
                            <!-- @update:group="
                                    (updatedGroup) => {
                                        const index = editable.findIndex(
                                            (g) => g._id === updatedGroup._id,
                                        );
                                        if (index !== -1) editable[index] = updatedGroup;
                                    }
                                " -->
                        </tbody>
                    </table>
                </div>
            </div>
        </LCard>
    </BasePage>

    <!-- <LModal v-model:isVisible="showModal" adaptiveSize noPadding>
        <EditGroup
            v-if="groups && newGroup"
            :group="newGroup"
            :groups="groups"
            :hasEditPermission="canCreateGroup"
            @save="updateNewGroups($event)"
        />
    </LModal> -->
</template>
