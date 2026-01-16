<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import GenericFilterBar from "@/components/common/GenericFilter/GenericFilterBar.vue";
import type {
    GenericFilterConfig,
    GenericQueryOptions,
} from "@/components/common/GenericFilter/types";
import { genericQuery } from "@/utils/genericQuery";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    type GroupAclEntryDto,
    type GroupDto,
} from "luminary-shared";
import { computed, ref } from "vue";
import LCard from "@/components/common/LCard.vue";
import GroupRow from "@/components/groups/GroupRow.vue";
import { validDocTypes } from "./permissions";
import EditGroup from "./EditGroup.vue";
import LModal from "../modals/LModal.vue";
import { isSmallScreen } from "@/globalConfig";

// GenericFilter configuration for GroupDto
const groupFilterConfig: GenericFilterConfig<GroupDto> = {
    fields: ["name", "updatedTimeUtc"],
    defaultOrderBy: "updatedTimeUtc",
    defaultOrderDirection: "desc",
    pageSize: 50,
};

// Initialize query options
const queryOptions = ref<GenericQueryOptions<GroupDto>>({
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    pageSize: 50,
    pageIndex: 0,
    search: "",
});

// Use the generic query function for data
const groups = genericQuery<GroupDto>(
    {
        docType: DocType.Group,
        searchableFields: ["name"],
    },
    queryOptions.value,
);

// Computed property to get editable groups with ACL processing
const editable = computed(() => {
    if (!groups.value?.docs) return [];

    return groups.value.docs.map((group) => {
        // Populate the acl with empty entries for types that are not set in the acl. Sort by type name.
        const aclGroupIDs = [...new Set(group.acl.map((aclEntry) => aclEntry.groupId))];
        aclGroupIDs.forEach((aclGroupId) => {
            validDocTypes
                .filter(
                    (d) =>
                        !group.acl.some(
                            (aclEntry) => aclEntry.type === d && aclEntry.groupId === aclGroupId,
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
    });
});

const isLoading = computed(() => !groups.value);

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

    // Add the new group to the reactive array
    if (groups.value?.docs) {
        groups.value.docs.push(newGroup);
    }

    newGroupId.value = newGroup._id;
    showModal.value = true;
};

const canCreateGroup = computed(() => {
    return hasAnyPermission(DocType.Group, AclPermission.Assign);
});

// Create a compatibility layer for components that still expect ApiLiveQueryAsEditable
// This provides the necessary interface while using the new genericQuery underneath
const groupQueryCompat = computed(() => {
    return {
        editable: editable,
        liveData: computed(() => groups.value?.docs || []),
        isEdited: () => false, // TODO: Implement if needed
        isModified: () => false, // TODO: Implement if needed
        revert: async () => {}, // TODO: Implement if needed
        save: async (group: GroupDto) => {
            // TODO: Implement save logic using genericQuery/API calls
            console.log("Saving group:", group);
        },
        duplicate: async (group: GroupDto) => {
            const newGroup = {
                ...group,
                _id: db.uuid(),
                name: `${group.name} (Copy)`,
                updatedTimeUtc: Date.now(),
            };
            if (groups.value?.docs) {
                groups.value.docs.push(newGroup);
            }
            return newGroup;
        },
    };
});
</script>

<template>
    <BasePage
        title="Groups"
        :is-full-width="true"
        :loading="isLoading"
        :should-show-page-title="false"
    >
        <template #internalPageHeader>
            <!-- Generic Filter Bar -->
            <GenericFilterBar
                :config="groupFilterConfig"
                v-model:query-options="queryOptions"
                :is-small-screen="isSmallScreen"
            />
        </template>

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
                                :groupQuery="groupQueryCompat as any"
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
            :group="editable.find((g: GroupDto) => g._id === newGroupId)!"
            :groups="editable"
            :hasEditPermission="canCreateGroup"
            :groupQuery="groupQueryCompat as any"
        />
    </LModal>
</template>
