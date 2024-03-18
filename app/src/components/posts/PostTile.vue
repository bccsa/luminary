<script setup lang="ts">
import type { Post } from "@/types";

type Props = {
    post: Post;
};
defineProps<Props>();
</script>

<template>
    <div class="shadow">
        {{ post.content[0]?.title }}
    </div>
</template>
