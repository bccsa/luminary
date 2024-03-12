<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LButton from "@/components/button/LButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { TagIcon } from "@heroicons/vue/24/solid";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { useTagStore } from "@/stores/tag";

const { topics } = storeToRefs(useTagStore());
</script>

<template>
    <BasePage title="Topics" :loading="topics === undefined">
        <template #actions>
            <LButton
                v-if="topics && topics.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'tags.create' }"
            >
                Create tag
            </LButton>
        </template>

        <EmptyState
            v-if="!topics || topics.length == 0"
            :icon="TagIcon"
            title="No topics yet"
            description="Get started by creating a new topic."
            buttonText="Create topic"
            :buttonLink="{ name: 'tags.create' }"
        />

        <ContentTable v-else :items="topics" editLinkName="tags.edit" />
    </BasePage>
</template>
