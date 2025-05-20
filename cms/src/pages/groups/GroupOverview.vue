<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import {
    AclPermission,
    db,
    DocType,
    getRest,
    hasAnyPermission,
    type ApiSearchQuery,
    type GroupDto,
} from "luminary-shared";
// import EditGroup from "@/components/groups/EditGroup.vue";
import { computed, ref, watch, provide } from "vue";
import GroupTable from "@/components/groups/GroupTable.vue";
import LModal from "@/components/modals/LModal.vue";
import EditGroup from "@/components/groups/EditGroup.vue";

const groupsQuery: ApiSearchQuery = {
    types: [DocType.Group],
};

const groups = ref<Map<string, GroupDto>>(new Map());
provide("groups", groups);

const getDbGroups = async () => {
    const _s = Object.fromEntries(groups.value);
    const latest = Object.values(_s).reduce((acc, curr) => {
        return curr.updatedTimeUtc > acc ? curr.updatedTimeUtc : acc;
    }, 0);

    latest ? (groupsQuery.from = latest) : delete groupsQuery.from;
    const _q = await getRest().search(groupsQuery);
    _q &&
        _q.docs &&
        _q.docs.forEach((d: GroupDto) => {
            groups.value.set(d._id, d);
        });
};
getDbGroups();
// poll api every 5 seconds for updates
setInterval(getDbGroups, 5000);

const newGroups = ref<GroupDto[]>([]);

// const duplicateGroup = (group: GroupDto) => {
//     newGroups.value.push(group);
// };

const combinedGroups = computed(() => {
    const _s = Object.fromEntries(groups.value);
    return newGroups.value.concat(Object.values(_s));
});

// Remove saved new groups from newGroups
watch(
    [newGroups, groups],
    async () => {
        const _s = Object.fromEntries(groups.value);
        const duplicates = newGroups.value.filter((g) =>
            Object.values(_s).some((dbG) => dbG._id === g._id),
        );
        for (const duplicate of duplicates) {
            newGroups.value.splice(newGroups.value.indexOf(duplicate), 1);
        }
    },
    { deep: true },
);

const openModal = ref(false);

const createGroup = async () => {
    openModal.value = true;
    const newGroup: GroupDto = {
        _id: db.uuid(),
        type: DocType.Group,
        name: "New group",
        acl: [],
        updatedTimeUtc: Date.now(),
    };

    newGroups.value.push(newGroup);
};

const canCreateGroup = computed(() => {
    return hasAnyPermission(DocType.Group, AclPermission.Assign);
});
</script>

<template>
    <BasePage title="Groups" :is-full-width="true" :loading="combinedGroups === undefined">
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

        <GroupTable />
    </BasePage>

    <LModal :isVisible="openModal" adaptiveSize noPadding>
        <EditGroup
            :group="newGroups[0]"
            :newGroups="newGroups"
            :hasEditPermission="canCreateGroup"
            @close="openModal = false"
            @save="openModal = false"
            @delete="openModal = false"
            @deleteGroup="openModal = false"
        />
    </LModal>
</template>
