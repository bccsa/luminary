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
import { computed, ref } from "vue";
import LCard from "@/components/common/LCard.vue";
import GroupRow from "@/components/groups/GroupRow.vue";
import { validDocTypes } from "./permissions";
import EditGroup from "./EditGroup.vue";
import LModal from "../modals/LModal.vue";

const groupQuery = new ApiLiveQueryAsEditable<GroupDto>(
    ref<ApiSearchQuery>({
        types: [DocType.Group],
    }),
    {
        filterFn: (group: GroupDto) => {
            // Filter out empty acl entries for comparison and saving
            const filteredAcl = group.acl
                .filter((aclEntry) => aclEntry.permission.length > 0)
                .sort((a, b) => a.type.localeCompare(b.type));
            return { ...group, acl: filteredAcl };
        },
        modifyFn: (group: GroupDto) => {
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

const editable = groupQuery.editable;
const isLoading = groupQuery.isLoading;

const showModal = ref(false);

const newGroupId = ref("");
const createGroup = async () => {
    const newGroup = {
        _id: db.uuid(),
        type: DocType.Group,
        name: "New group",
        acl: [] as GroupAclEntryDto[],
        updatedTimeUtc: Date.now(),
    } as GroupDto;

    editable.value.push(newGroup);
    newGroupId.value = newGroup._id;
    showModal.value = true;
};

const canCreateGroup = computed(() => {
    return hasAnyPermission(DocType.Group, AclPermission.Assign);
});
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
                        </tbody>
                    </table>
                </div>
            </div>
        </LCard>
    </BasePage>

    <LModal heading="Edit Group" v-model:isVisible="showModal" adaptiveSize noPadding>
        <EditGroup
            v-if="showModal"
            :group="editable.find((g) => g._id === newGroupId)!"
            :groups="editable"
            :hasEditPermission="canCreateGroup"
            :group-query="groupQuery"
        />
    </LModal>
</template>
