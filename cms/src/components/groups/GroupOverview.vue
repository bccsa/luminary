<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import GroupDisplayCard from "./GroupDisplayCard.vue";
import GroupFilterOptions from "./GroupFilterOptions.vue";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    toEditable,
    type GroupAclEntryDto,
    type GroupDto,
    useHybridQueryWithState,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { validDocTypes } from "./permissions";
import EditGroup from "./EditGroup.vue";
import { isSmallScreen } from "@/globalConfig";
import ConfirmBeforeLeavingModal from "../modals/ConfirmBeforeLeavingModal.vue";
import { type GroupOverviewQueryOptions } from "./GroupOverview/types";
import { MapIcon, ListBulletIcon } from "@heroicons/vue/24/outline";
import GroupGraph from "./GroupGraph/GroupGraph.vue";
import EmptyState from "@/components/EmptyState.vue";

const { output: groupsSource, isFetching } = useHybridQueryWithState<GroupDto>(
    () => ({
        selector: {
            type: DocType.Group,
        },
    }),

    {
        live: true,
    },
);

const groupQuery = toEditable<GroupDto>(
    groupsSource,

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
        persistOffline: true,
    },
);

const editable = groupQuery.editable;
const { isEdited } = groupQuery;

const showModal = ref(false);

const defaultQueryOptions: GroupOverviewQueryOptions = {
    search: "",
    filterGroupIds: [],
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
};

const savedQueryOptions = () => sessionStorage.getItem("queryOptions_group_overview");

function mergeNewFields(saved: string | null): GroupOverviewQueryOptions {
    const parsed = saved ? JSON.parse(saved) : {};
    return {
        ...defaultQueryOptions,
        ...parsed,
    };
}

const queryOptions = ref<GroupOverviewQueryOptions>(
    mergeNewFields(savedQueryOptions()) as GroupOverviewQueryOptions,
);

watch(
    queryOptions,
    () => {
        sessionStorage.setItem("queryOptions_group_overview", JSON.stringify(queryOptions.value));
    },
    { deep: true },
);

const resetQueryOptions = () => {
    queryOptions.value = {
        search: "",
        filterGroupIds: [],
        orderBy: "updatedTimeUtc",
        orderDirection: "desc",
    };
};

const filteredGroups = computed(() => {
    let result = [...editable.value];

    if (queryOptions.value.search) {
        const searchLower = queryOptions.value.search.toLowerCase();
        result = result.filter((group) => group.name.toLowerCase().includes(searchLower));
    }

    if (queryOptions.value.filterGroupIds && queryOptions.value.filterGroupIds.length > 0) {
        result = result.filter((group) => {
            return queryOptions.value.filterGroupIds.every((filterId) =>
                group.acl.some((aclEntry) => aclEntry.groupId === filterId),
            );
        });
    }

    result.sort((a, b) => {
        if (queryOptions.value.orderBy === "name") {
            const valA = a.name.toLowerCase();
            const valB = b.name.toLowerCase();
            if (valA < valB) return queryOptions.value.orderDirection === "asc" ? -1 : 1;
            if (valA > valB) return queryOptions.value.orderDirection === "asc" ? 1 : -1;
            return 0;
        } else if (queryOptions.value.orderBy === "updatedTimeUtc") {
            const valA = a.updatedTimeUtc || 0;
            const valB = b.updatedTimeUtc || 0;
            return queryOptions.value.orderDirection === "asc" ? valA - valB : valB - valA;
        }
        return 0;
    });

    return result;
});
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

const currentTab = ref("overview");
const toggleView = () => {
    currentTab.value = currentTab.value === "overview" ? "graph" : "overview";
};

const handleGraphSelect = (groupId: string) => {
    newGroupId.value = groupId;
    showModal.value = true;
};

const hasAnyContent = computed(() => editable.value.length > 0);
</script>

<template>
    <BasePage title="Groups" :is-full-width="true" :loading="isFetching">
        <template #pageNav>
            <div class="relative z-20 flex items-center justify-end">
                <LButton
                    variant="secondary"
                    :icon="currentTab === 'overview' ? MapIcon : ListBulletIcon"
                    :aria-label="currentTab === 'overview' ? 'Show visualisation' : 'Show overview'"
                    @click="toggleView"
                />
            </div>
        </template>
        <template #topBarActionsDesktop>
            <LButton
                v-if="canCreateGroup && hasAnyContent && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="createGroup"
                data-test="createGroupButton"
            >
                Create group
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <PlusIcon
                v-if="canCreateGroup && hasAnyContent && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="createGroup"
                data-test="createGroupButton"
            />
        </template>

        <template v-if="currentTab === 'overview' && hasAnyContent" #internalPageHeader>
            <GroupFilterOptions
                :groups="editable"
                :reset="resetQueryOptions"
                v-model:query-options="queryOptions"
                :isSmallScreen="isSmallScreen"
            />
        </template>

        <div v-show="currentTab === 'overview'" class="mt-1 flex flex-col gap-[3px]">
            <p v-if="hasAnyContent" class="mb-2 text-sm text-zinc-500">
                <span>
                    Configure access permissions for the groups listed below to control who can
                    access them and their member documents.
                </span>
                <span class="text-[13px] italic">
                    <br />Note that users may inherit additional rights from higher-level groups,
                    potentially granting broader access than explicitly configured here.
                </span>
            </p>

            <EmptyState
                v-if="!isFetching && !hasAnyContent"
                title="No groups yet"
                description="Create a group to configure access permissions for your content."
                :button-text="canCreateGroup ? 'Create group' : undefined"
                :button-action="canCreateGroup ? createGroup : undefined"
                :button-permission="canCreateGroup"
                data-test="createGroupButton"
                show-back-button
            />

            <EmptyState
                v-else-if="hasAnyContent && filteredGroups.length === 0"
                title="No groups found"
                description="No groups match your search criteria."
            />

            <GroupDisplayCard
                v-for="group in filteredGroups"
                :key="group._id"
                v-model:group="editable[editable.findIndex((g) => g._id === group._id)]"
                :groupQuery="groupQuery"
            />
        </div>

        <div
            v-show="currentTab === 'graph'"
            class="h-[calc(100dvh-6.75rem)] min-h-[520px] md:h-[calc(100vh-5.75rem)] md:min-h-[640px]"
        >
            <KeepAlive>
                <GroupGraph
                    v-if="currentTab === 'graph'"
                    class="h-full w-full"
                    :groups="filteredGroups"
                    :all-groups="editable"
                    @select="handleGraphSelect"
                />
            </KeepAlive>
        </div>

        <EditGroup
            v-if="selectedGroup"
            :openModal="showModal"
            :group="selectedGroup"
            :groups="editable"
            :hasEditPermission="canCreateGroup"
            :group-query="groupQuery"
            @close="showModal = false"
        />

        <ConfirmBeforeLeavingModal :isDirty="isDirty" />
    </BasePage>
</template>
