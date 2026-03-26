<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import GroupDisplayCard from "./GroupDisplayCard.vue";
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
import { validDocTypes } from "./permissions";
import EditGroup from "./EditGroup.vue";
import { isSmallScreen } from "@/globalConfig";
import ConfirmBeforeLeavingModal from "../modals/ConfirmBeforeLeavingModal.vue";

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
const { isEdited } = groupQuery;

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

const selectedGroup = computed(() => editable.value.find((g) => g._id === newGroupId.value));

const isDirty = computed(() => {
    // Check if any group in the list has unsaved changes
    return editable.value.some((g) => isEdited.value(g._id));
});
</script>

<template>
    <BasePage title="Groups" :is-full-width="true" :loading="isLoading">
        <template #pageNav>
            <LButton
                v-if="canCreateGroup && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="createGroup"
                data-test="createGroupButton"
            >
                Create group
            </LButton>
            <PlusIcon
                v-else-if="canCreateGroup && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="createGroup"
                data-test="createGroupButton"
            />
        </template>

        <p class="mb-2 mt-1 p-2 py-1 text-sm text-gray-500">
            <span>
                Configure access permissions for the groups listed below to control who can access
                them and their member documents.
            </span>
            <span class="text-[13px] italic">
                <br />Note that users may inherit additional rights from higher-level groups,
                potentially granting broader access than explicitly configured here.
            </span>
        </p>

        <GroupDisplayCard
            v-for="(group, index) in editable"
            :key="group._id"
            v-model:group="editable[index]"
            :groupQuery="groupQuery"
        />

        <EditGroup
            v-if="selectedGroup"
            :openModal="showModal"
            :group="selectedGroup"
            :groups="editable"
            :hasEditPermission="canCreateGroup"
            :group-query="groupQuery"
            @close="showModal = false"
        />
    </BasePage>
    <ConfirmBeforeLeavingModal :isDirty="isDirty" />
</template>
