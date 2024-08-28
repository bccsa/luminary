<script setup lang="ts">
import { db, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";

type Props = {
    content: ContentDto;
    showPublishDate?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
});

const router = useRouter();

const openContent = () => {
    router.push({ name: "content", params: { slug: props.content.slug } });
};
</script>

<template>
    <div
        @click="openContent"
        class="-m-2 cursor-pointer rounded-md p-2 hover:bg-zinc-50 active:bg-zinc-100 active:shadow-inner dark:hover:bg-zinc-500 dark:active:bg-zinc-400"
    >
        <img :src="content.parentImage" class="aspect-video rounded-lg object-cover shadow-md" />
        <h3 class="mt-2 text-sm text-zinc-800 dark:text-zinc-50">{{ content.title }}</h3>
        <div
            v-if="showPublishDate && content.parentPublishDateVisible"
            class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-200"
        >
            {{ db.toDateTime(content.publishDate!).toLocaleString(DateTime.DATETIME_MED) }}
        </div>
    </div>
</template>
