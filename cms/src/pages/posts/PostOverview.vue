<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import AcButton from "@/components/forms/AcButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
</script>

<template>
    <BasePage title="Posts">
        <template #actions>
            <AcButton :icon="PlusIcon" :is="RouterLink" :to="{ name: 'posts.create' }">
                Create Post
            </AcButton>
        </template>
        <EmptyState
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create Post"
            :buttonLink="{ name: 'posts.create' }"
        />
    </BasePage>
</template>
