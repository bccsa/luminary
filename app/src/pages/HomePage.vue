<script setup lang="ts">
import PostTile from "@/components/posts/PostTile.vue";
import { usePostStore } from "@/stores/post";
import { storeToRefs } from "pinia";

const postStore = usePostStore();

const { posts } = storeToRefs(postStore);
</script>

<template>
    <div>
        <h2 class="mb-4">Posts</h2>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PostTile v-for="post in posts" :key="post._id" :post="post" />
        </div>
    </div>
</template>
