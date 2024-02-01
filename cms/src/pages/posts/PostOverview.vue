<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import AcButton from "@/components/button/AcButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import AcCard from "@/components/common/AcCard.vue";
import AcTable from "@/components/common/AcTable.vue";
import { ref, toRefs } from "vue";

const store = usePostStore();

const sortBy = ref(undefined);
const sortDirection = ref(undefined);
const columns = [
    {
        text: "Id",
        key: "_id",
    },
    {
        text: "Title",
        key: "title",
    },
    {
        text: "Last updated",
        key: "updatedTimeUtc",
    },
];
</script>

<template>
    <BasePage title="Posts">
        <template #actions>
            <AcButton
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'posts.create' }"
            >
                Create Post
            </AcButton>
        </template>

        <EmptyState
            v-if="store.posts.length == 0"
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create Post"
            :buttonLink="{ name: 'posts.create' }"
        />

        <AcCard v-else padding="none">
            <AcTable
                :columns="columns"
                :items="store.posts"
                v-model:sortBy="sortBy"
                v-model:sortDirection="sortDirection"
            />
        </AcCard>
    </BasePage>
</template>
