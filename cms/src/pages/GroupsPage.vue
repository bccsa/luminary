<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import GroupEditor from "@/components/groups/GroupEditor.vue";
import { useGroupStore } from "@/stores/group";
import { sortByName } from "@/util/sortByName";
import { storeToRefs } from "pinia";
import { computed } from "vue";

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
    <BasePage title="Groups">
        <GroupEditor v-for="group in sortedGroups" :key="group._id" :group="group" class="mb-4" />
    </BasePage>
</template>
