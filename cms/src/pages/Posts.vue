<script setup lang="ts">
import Page from "@/components/Page.vue";
import EmptyState from "@/components/EmptyState.vue";

const createPost = () => {
    console.log("create post");
};
</script>

<template>
    <Page title="Posts">
        <EmptyState
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create Post"
            :buttonAction="createPost"
        />
    </Page>
</template>
