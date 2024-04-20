<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import GroupEditor from "@/components/groups/GroupEditor.vue";
import { useGroupStore } from "@/stores/group";
import { sortByName } from "@/util/sortByName";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";

const { groups } = storeToRefs(useGroupStore());

const sortedGroups = computed(() => {
    let sortedGroups = groups.value;

    if (!sortedGroups || sortedGroups.length == 1) {
        return sortedGroups;
    }

    return sortedGroups.sort(sortByName);
});
</script>

<template>
    <BasePage title="Groups" :loading="groups === undefined">
        <template #actions>
            <LButton
                v-if="groups && groups.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'groups.create' }"
            >
                Create group
            </LButton>
        </template>

        <GroupEditor v-for="group in sortedGroups" :key="group._id" :group="group" class="mb-4" />
    </BasePage>
</template>
