<script setup lang="ts">
import type { Post } from "@/types";
import { DateTime } from "luxon";

type Props = {
    post: Post;
};
defineProps<Props>();
</script>

<template>
    <div>
        <img :src="post.image" class="rounded shadow-md" />
        <h3 class="mt-2 text-zinc-800">{{ post.content[0].title }}</h3>
        <div class="mt-0.5 text-sm text-zinc-500">
            {{ post.content[0].publishDate?.toLocaleString(DateTime.DATE_FULL) }}
        </div>
    </div>
</template>
