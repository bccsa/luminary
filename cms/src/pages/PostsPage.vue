<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";

const createPost = () => {
    console.log("create post");
};
</script>

<template>
    <BasePage title="Posts">
        <EmptyState
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create Post"
            :buttonAction="createPost"
        />
    </BasePage>
</template>
