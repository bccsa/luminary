<script setup lang="ts">
import type { Post } from "@/types";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";

type Props = {
    post: Post;
};
const props = defineProps<Props>();

const router = useRouter();

const openPost = () => {
    router.push({ name: "post", params: { slug: props.post.content[0]?.slug } });
};
</script>

<template>
    <div
        @click="openPost"
        class="-m-2 cursor-pointer rounded-md p-2 hover:bg-zinc-50 active:bg-zinc-100 active:shadow-inner dark:hover:bg-zinc-500 dark:active:bg-zinc-400"
    >
        <img :src="post.image" class="aspect-video rounded-lg object-cover shadow-md" />
        <h3 class="mt-2 text-sm text-zinc-800 dark:text-zinc-50">{{ post.content[0].title }}</h3>
        <div class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-200">
            {{ post.content[0].publishDate?.toLocaleString(DateTime.DATE_FULL) }}
        </div>
    </div>
</template>
