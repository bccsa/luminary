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

const { categories } = storeToRefs(useTagStore());
</script>

<template>
    <BasePage title="Categories" :loading="categories === undefined">
        <template #actions>
            <LButton
                v-if="categories && categories.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'tags.create' }"
            >
                Create category
            </LButton>
        </template>

        <EmptyState
            v-if="!categories || categories.length == 0"
            :icon="TagIcon"
            title="No categories yet"
            description="Get started by creating a new category."
            buttonText="Create category"
            :buttonLink="{ name: 'tags.create' }"
        />

        <ContentTable v-else :items="categories" editLinkName="tags.edit" />
    </BasePage>
</template>
