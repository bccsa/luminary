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
    <div @click="openContent" class="ease-out-expo group transition hover:brightness-[1.15]">
        <div
            class="avoid-inside ease-out-expo -m-2 cursor-pointer rounded-md p-2 transition-transform duration-500 active:shadow-inner group-hover:scale-[101%]"
        >
            <img
                :src="content.parentImage"
                class="aspect-video rounded-lg object-cover opacity-100 shadow-md"
            />
        </div>
        <h3 class="mt-2 text-sm text-zinc-800 dark:text-zinc-50">{{ content.title }}</h3>
        <div
            v-if="showPublishDate && content.parentPublishDateVisible"
            class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-200"
        >
            {{ db.toDateTime(content.publishDate!).toLocaleString(DateTime.DATETIME_MED) }}
        </div>
    </div>
</template>
