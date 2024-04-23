<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import ContentTable from "@/components/content/ContentTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import { storeToRefs } from "pinia";
import { DocType } from "@/types";

const { posts } = storeToRefs(usePostStore());
</script>

<template>
    <BasePage title="Posts" :loading="posts === undefined">
        <template #actions>
            <LButton
                v-if="posts && posts.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'posts.create' }"
            >
                Create post
            </LButton>
        </template>

        <EmptyState
            v-if="!posts || posts.length == 0"
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create post"
            :buttonLink="{ name: 'posts.create' }"
        />

        <ContentTable v-else :items="posts" :docType="DocType.Post" editLinkName="posts.edit" />
    </BasePage>
</template>
