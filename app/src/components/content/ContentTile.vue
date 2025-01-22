<script setup lang="ts">
import { db, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import LImage from "../images/LImage.vue";

type Props = {
    content: ContentDto;
    showPublishDate?: boolean;
    aspectRatio?: typeof LImage.aspectRatios;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
    aspectRatio: "video",
});

const router = useRouter();

const openContent = () => {
    router.push({ name: "content", params: { slug: props.content.slug } });
};
</script>

<template>
    <div @click="openContent" class="ease-out-expo group transition hover:brightness-[1.15]">
        <div
            class="avoid-inside ease-out-expo -m-2 cursor-pointer p-2 active:shadow-inner group-hover:scale-[101%]"
        >
            <LImage
                :image="content.parentImageData"
                :aspectRatio="aspectRatio"
                size="thumbnail"
                :contentTitle="content.title"
            >
                <div class="w-full">
                    <h3 class="mt-1 truncate text-sm text-zinc-800 dark:text-slate-50">
                        {{ content.title }}
                    </h3>
                    <div
                        v-if="showPublishDate && content.parentPublishDateVisible"
                        class="mt-0.5 text-xs text-zinc-500 dark:text-slate-400"
                    >
                        {{
                            content.publishDate
                                ? db
                                      .toDateTime(content.publishDate!)
                                      .toLocaleString(DateTime.DATETIME_MED)
                                : ""
                        }}
                    </div>
                </div>
            </LImage>
        </div>
    </div>
</template>
