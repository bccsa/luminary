<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import GroupDisplayCard from "./GroupDisplayCard.vue";
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
import { MapIcon, MagnifyingGlassIcon, ListBulletIcon } from "@heroicons/vue/24/outline";
import GroupGraph from "./GroupGraph.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import LInput from "../forms/LInput.vue";

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

const filteredGroups = computed(() => {
    let result = [...editable.value];

    if (queryOptions.value.search) {
        const searchLower = queryOptions.value.search.toLowerCase();
        result = result.filter((group) => group.name.toLowerCase().includes(searchLower));
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
const showViewDropdown = ref(false);
const tabs = [
    { title: "Overview", key: "overview", icon: ListBulletIcon },
    { title: "Visualisation", key: "graph", icon: MapIcon },
];
const activeTab = computed(() => tabs.find((tab) => tab.key === currentTab.value) ?? tabs[0]);

const handleGraphSelect = (groupId: string) => {
    newGroupId.value = groupId;
    showModal.value = true;
};
</script>

<template>
    <BasePage title="Groups" :is-full-width="true" :loading="isFetching">
        <template #pageNav>
            <div class="relative z-20 flex items-center justify-end px-3 sm:px-8">
                <LDropdown
                    v-model:show="showViewDropdown"
                    placement="bottom-end"
                    width="auto"
                    padding="small"
                    class="w-full sm:w-auto"
                >
                    <template #trigger>
                        <LButton
                            variant="secondary"
                            :icon="activeTab.icon"
                            class="w-full sm:w-auto"
                        >
                            {{ activeTab.title }}
                        </LButton>
                    </template>
                    <LButton
                        v-for="tab in tabs"
                        :key="tab.key"
                        variant="tertiary"
                        size="sm"
                        :icon="tab.icon"
                        role="menuitem"
                        :main-dynamic-css="
                            currentTab === tab.key ? 'font-semibold text-zinc-950' : 'text-zinc-600'
                        "
                        @click="
                            currentTab = tab.key;
                            showViewDropdown = false;
                        "
                    >
                        {{ tab.title }}
                    </LButton>
                </LDropdown>
            </div>
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

        <template #internalPageHeader>
            <div
                class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow-md"
            >
                <div class="flex w-full items-center gap-1 px-3 py-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="flex-grow"
                        name="search"
                        placeholder="Search..."
                        data-test="search-input"
                        v-model="queryOptions.search"
                        :full-height="true"
                    />
                </div>
            </div>
        </template>

        <div v-show="currentTab === 'overview'">
            <p class="mb-2 mt-1 p-2 py-1 text-sm text-gray-500">
                <span>
                    Configure access permissions for the groups listed below to control who can
                    access them and their member documents.
                </span>
                <span class="text-[13px] italic">
                    <br />Note that users may inherit additional rights from higher-level groups,
                    potentially granting broader access than explicitly configured here.
                </span>
            </p>

            <GroupDisplayCard
                v-for="group in filteredGroups"
                :key="group._id"
                v-model:group="editable[editable.findIndex((g) => g._id === group._id)]"
                :groupQuery="groupQuery"
            />
        </div>

        <div
            v-show="currentTab === 'graph'"
            class="h-[calc(100dvh-9.75rem)] min-h-[520px] md:h-[calc(100vh-8.75rem)] md:min-h-[640px]"
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
