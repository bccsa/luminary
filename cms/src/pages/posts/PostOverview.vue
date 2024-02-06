<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import AcButton from "@/components/button/AcButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import AcCard from "@/components/common/AcCard.vue";
import AcTable from "@/components/common/AcTable.vue";
import { ref } from "vue";
import type { Post } from "@/types";

const store = usePostStore();

const sortBy = ref(undefined);
const sortDirection = ref(undefined);
const columns = [
    {
        text: "Title",
        key: "title",
        sortMethod: (a: Post, b: Post) => {
            const firstItem = a.content[0].title;
            const secondItem = b.content[0].title;
            if (firstItem < secondItem) return sortDirection.value == "descending" ? 1 : -1;
            if (firstItem > secondItem) return sortDirection.value == "descending" ? -1 : 1;
            return 0;
        },
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
                v-if="store.posts && store.posts.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'posts.create' }"
            >
                Create Post
            </AcButton>
        </template>

        <EmptyState
            v-if="!store.posts || store.posts.length == 0"
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
            >
                <template #item.title="{ content }">
                    {{ content[0].title }}
                </template>
            </AcTable>
        </AcCard>
    </BasePage>
</template>
