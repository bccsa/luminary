<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import GroupDisplayCard from "./GroupDisplayCard.vue";
import FilterOptions from "@/components/common/FilterOptions.vue";
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
import { availablePermissionsPerDocType, validDocTypes } from "./permissions";
import { filterGroupAcl, isAclFilterActive } from "./aclFilter";
import LCombobox from "@/components/forms/LCombobox.vue";
import LTag from "@/components/content/LTag.vue";
import EditGroup from "./EditGroup.vue";
import { isSmallScreen } from "@/globalConfig";
import ConfirmBeforeLeavingModal from "../modals/ConfirmBeforeLeavingModal.vue";
import { type GroupOverviewQueryOptions } from "./GroupOverview/types";
import { MapIcon, ListBulletIcon, DocumentTextIcon, KeyIcon } from "@heroicons/vue/24/outline";
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
    filterDocTypes: [],
    filterPermissions: [],
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
        filterDocTypes: [],
        filterPermissions: [],
        orderBy: "updatedTimeUtc",
        orderDirection: "desc",
    };
};

const aclFilter = computed(() => ({
    types: queryOptions.value.filterDocTypes,
    permissions: queryOptions.value.filterPermissions,
}));

const label = (value: string) =>
    value.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const docTypeOptions = validDocTypes.map((t) => ({ id: t, label: label(t), value: t }));
const permissionOptions = [...new Set(Object.values(availablePermissionsPerDocType).flat())].map(
    (p) => ({ id: p, label: label(p), value: p }),
);

/** Groups with ACLs narrowed to the doc type/permission filter; drives the graph's edges. */
const aclFilteredGroups = computed(() => filterGroupAcl(editable.value, aclFilter.value));

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

    if (isAclFilterActive(aclFilter.value)) {
        const matching = new Set(
            aclFilteredGroups.value.filter((g) => g.acl.length > 0).map((g) => g._id),
        );
        result = result.filter((group) => matching.has(group._id));
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
                    :aria-label="currentTab === 'overview' ? 'Show visualisation' : 'Show list'"
                    @click="toggleView"
                >
                    {{ currentTab === "overview" ? "Graph" : "List" }}
                </LButton>
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
            <LButton
                v-if="canCreateGroup && hasAnyContent && isSmallScreen"
                variant="primary"
                class="max-lg:gap-x-0"
                :icon="PlusIcon"
                icon-class="max-lg:ml-0"
                @click="createGroup"
                data-test="createGroupButton"
                aria-label="Create group"
            >
                <span class="hidden lg:inline">Create group</span>
            </LButton>
        </template>

        <template v-if="hasAnyContent" #internalPageHeader>
            <FilterOptions
                v-model:search="queryOptions.search"
                v-model:selected-groups="queryOptions.filterGroupIds"
                :groups="editable"
                :is-small-screen="isSmallScreen"
                @reset="resetQueryOptions"
            >
                <template #extra-filters>
                    <LCombobox
                        :options="docTypeOptions"
                        v-model:selected-options="queryOptions.filterDocTypes"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="false"
                        placeholder="Doc type"
                        :icon="DocumentTextIcon"
                        data-test="filter-doc-types"
                    />
                    <LCombobox
                        :options="permissionOptions"
                        v-model:selected-options="queryOptions.filterPermissions"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="false"
                        placeholder="Permission"
                        :icon="KeyIcon"
                        data-test="filter-permissions"
                    />
                </template>
                <template #selected-filters>
                    <ul
                        v-if="
                            queryOptions.filterDocTypes.length ||
                            queryOptions.filterPermissions.length
                        "
                        class="flex w-full flex-wrap gap-2"
                    >
                        <LTag
                            v-for="t in queryOptions.filterDocTypes"
                            :key="`type-${t}`"
                            @remove="
                                queryOptions.filterDocTypes = queryOptions.filterDocTypes.filter(
                                    (x) => x !== t,
                                )
                            "
                        >
                            {{ label(t) }}
                        </LTag>
                        <LTag
                            v-for="p in queryOptions.filterPermissions"
                            :key="`perm-${p}`"
                            @remove="
                                queryOptions.filterPermissions =
                                    queryOptions.filterPermissions.filter((x) => x !== p)
                            "
                        >
                            {{ label(p) }}
                        </LTag>
                    </ul>
                </template>
            </FilterOptions>
        </template>

        <div v-show="currentTab === 'overview'" class="flex flex-col gap-[4px]">
            <p v-if="hasAnyContent" class="mb-2 px-2 py-1 text-sm text-zinc-500">
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
                    :all-groups="editable"
                    :edge-groups="isAclFilterActive(aclFilter) ? aclFilteredGroups : undefined"
                    @open="handleGraphSelect"
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
