<script setup lang="ts">
import { db, DocType, type ContentDto } from "luminary-shared";
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
        v-if="content.parentType !== DocType.Tag"
        @click="openContent"
        class="-m-2 cursor-pointer rounded-md p-2 hover:bg-zinc-50 active:bg-zinc-100 active:shadow-inner dark:hover:bg-zinc-500 dark:active:bg-zinc-400"
    >
        <img
            :src="content.parentImage"
            draggable="false"
            class="aspect-video rounded-lg object-cover shadow-md"
        />
        <h3 class="mt-2 text-sm text-zinc-800 dark:text-zinc-50">{{ content.title }}</h3>
        <div
            v-if="showPublishDate && content.parentPublishDateVisible"
            class="mt-0.5 text-xs text-zinc-500 dark:text-slate-200"
        >
            {{
                content.publishDate
                    ? db.toDateTime(content.publishDate).toLocaleString(DateTime.DATETIME_MED)
                    : ""
            }}
        </div>
    </div>

    <div
        v-else
        class="ease-out-expo group flex aspect-video h-32 w-full flex-wrap transition hover:brightness-[1.15] sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5"
    >
        <div
            class="avoid-inside hover:shadow-outline ease-out-expo relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg p-2 transition-transform duration-500 group-hover:scale-[101%]"
            @click="openContent"
        >
            <img
                :src="content.parentImage"
                class="absolute h-full w-full object-cover object-center opacity-100 transition"
            />
            <div class="absolute inset-0 bg-black opacity-50"></div>
            <h6
                class="z-10 content-end break-words text-center text-sm font-bold leading-tight text-white"
            >
                {{ content.title }}
            </h6>
        </div>
    </div>
</template>
