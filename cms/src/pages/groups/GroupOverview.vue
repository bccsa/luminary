<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import { db, AclPermission, DocType, hasAnyPermission, type GroupDto } from "luminary-shared";
import EditGroup from "@/components/groups/EditGroup.vue";
import { computed, ref, watch } from "vue";

const dbGroups = db.toRef<GroupDto[]>(
    () =>
        db.docs.where("type").equals(DocType.Group).sortBy("name") as unknown as Promise<
            GroupDto[]
        >,
    [],
);

const newGroups = ref<GroupDto[]>([]);

const combinedGroups = computed(() => {
    return newGroups.value.concat(dbGroups.value);
});

// Remove saved new groups from newGroups
watch([newGroups, dbGroups], () => {
    const duplicates = newGroups.value.filter((g) =>
        dbGroups.value.some((dbG) => dbG._id === g._id),
    );
    for (const duplicate of duplicates) {
        newGroups.value.splice(newGroups.value.indexOf(duplicate), 1);
    }
});

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

        <EditGroup v-for="group in combinedGroups" :key="group._id" :group="group" class="mb-4" />
    </BasePage>
</template>
