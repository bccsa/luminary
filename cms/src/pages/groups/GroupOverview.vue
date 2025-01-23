<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import {
    AclPermission,
    db,
    DocType,
    api,
    hasAnyPermission,
    type ApiSearchQuery,
    type GroupDto,
} from "luminary-shared";
import EditGroup from "@/components/groups/EditGroup.vue";
import { computed, ref, watch } from "vue";

const groupsQuery: ApiSearchQuery = {
    apiVersion: "0.0.0",
    types: [DocType.Group],
};

const dbGroups = ref<Map<string, GroupDto>>(new Map());

const getDbGroups = async () => {
    const _s = Object.fromEntries(dbGroups.value);
    const latest = Object.values(_s).reduce((acc, curr) => {
        return curr.updatedTimeUtc > acc ? curr.updatedTimeUtc : acc;
    }, 0);

    latest ? (groupsQuery.from = latest) : delete groupsQuery.from;
    const _q = await api().rest().search(groupsQuery);
    _q.docs &&
        _q.docs.forEach((d: GroupDto) => {
            dbGroups.value.set(d._id, d);
        });
};
getDbGroups();
// poll api every 5 seconds for updates
setInterval(getDbGroups, 5000);

const newGroups = ref<GroupDto[]>([]);

const combinedGroups = computed(() => {
    const _s = Object.fromEntries(dbGroups.value);
    return newGroups.value.concat(Object.values(_s));
});

// Remove saved new groups from newGroups
watch(
    [newGroups, dbGroups],
    async () => {
        const _s = Object.fromEntries(dbGroups.value);
        const duplicates = newGroups.value.filter((g) =>
            Object.values(_s).some((dbG) => dbG._id === g._id),
        );
        for (const duplicate of duplicates) {
            newGroups.value.splice(newGroups.value.indexOf(duplicate), 1);
        }
    },
    { deep: true },
);

const createGroup = async () => {
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
    <BasePage title="Groups" :loading="combinedGroups === undefined">
        <template #actions>
            <LButton
                v-if="combinedGroups && combinedGroups.length > 0 && canCreateGroup"
                variant="primary"
                :icon="PlusIcon"
                @click="createGroup"
                data-test="createGroupButton"
            >
                Create group
            </LButton>
        </template>

        <div v-if="combinedGroups.length">
            <EditGroup
                v-for="group in combinedGroups"
                :key="group._id"
                :group="group"
                class="mb-4"
            />
        </div>
        <span v-else>Loading...</span>
    </BasePage>
</template>
