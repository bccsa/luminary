<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import GroupEditor from "@/components/groups/GroupEditor.vue";
import { useGroupStore } from "@/stores/group";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const { groups } = storeToRefs(useGroupStore());

const sortedGroups = computed(() => {
    let sortedGroups = groups.value;

    if (!sortedGroups || sortedGroups.length == 1) {
        return sortedGroups;
    }

    return sortedGroups.sort((a, b) => {
        if (a.name > b.name) return 1;
        if (a.name < b.name) return -1;
        return 0;
    });
});
</script>

<template>
    <BasePage title="Groups">
        <GroupEditor v-for="group in sortedGroups" :key="group._id" :group="group" class="mb-4" />
    </BasePage>
</template>
