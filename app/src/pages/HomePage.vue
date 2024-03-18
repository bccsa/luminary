<script setup lang="ts">
import PostTile from "@/components/posts/PostTile.vue";
import { usePostStore } from "@/stores/post";
import { storeToRefs } from "pinia";

const postStore = usePostStore();

const { posts } = storeToRefs(postStore);
</script>

<template>
    <div>
        Posts

        <div>
            <PostTile v-for="post in posts" :key="post._id" :post="post" />
        </div>
    </div>
</template>
