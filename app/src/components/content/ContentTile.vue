<script setup lang="ts">
import { db, type ContentDto } from "luminary-shared";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import LImage from "../images/LImage.vue";

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
            class="avoid-inside ease-out-expo -m-2 cursor-pointer p-2 transition-transform duration-500 active:shadow-inner group-hover:scale-[101%]"
        >
            <LImage
                v-if="content.parentImageData"
                :image="content.parentImageData"
                aspectRatio="video"
                size="thumbnail"
            >
                <div class="w-full">
                    <h3 class="mt-1 truncate text-sm text-zinc-800 dark:text-slate-50">
                        {{ content.title }}
                    </h3>
                    <div
                        v-if="showPublishDate && content.parentPublishDateVisible"
                        class="mt-0.5 text-xs text-zinc-500 dark:text-slate-200"
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
