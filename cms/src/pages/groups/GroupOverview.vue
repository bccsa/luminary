<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { RouterLink } from "vue-router";
import { PlusIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";
import { db, DocType, type GroupDto } from "luminary-shared";
import EditGroup from "@/components/groups/EditGroup.vue";

const groups = db.toRef<GroupDto[]>(
    () =>
        db.docs.where("type").equals(DocType.Group).sortBy("name") as unknown as Promise<
            GroupDto[]
        >,
    [],
);
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

        <EditGroup v-for="group in groups" :key="group._id" :group="group" class="mb-4" />
    </BasePage>
</template>
