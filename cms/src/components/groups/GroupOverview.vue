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
        <template #pageNav>
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

        <GroupDisplayCard
            v-for="(group, index) in editable"
            :key="group._id"
            v-model:group="editable[index]"
            :groupQuery="groupQuery"
        />
    </BasePage>

    <EditGroup
        :openModal="showModal"
        :group="editable.find((g: GroupDto) => g._id === newGroupId)!"
        :groups="editable"
        :hasEditPermission="canCreateGroup"
        :group-query="groupQuery"
        @close="showModal = false"
    />
</template>
