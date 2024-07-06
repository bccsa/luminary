<script setup lang="ts">
import { DocType, db, type ContentDto } from "luminary-shared";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import { computed, ref, watch } from "vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { DateTime } from "luxon";

type Props = {
    slug: string;
};
const props = defineProps<Props>();

const content = db.getBySlugAsRef<ContentDto>(props.slug);
const tagsContent = ref<ContentDto[]>([]);

watch(
    content,
    async () => {
        if (!content.value) return;
        tagsContent.value = await db.whereParent(
            content.value.tags,
            DocType.Tag,
            content.value.language,
        );
    },
    { immediate: true },
);

const isLoading = computed(() => {
    return content.value == undefined;
});

const text = computed(() => {
    if (!content.value.text) {
        return "";
    }

    let text;

    // Only parse text with TipTap if it's JSON, otherwise we render it out as HTML
    try {
        text = JSON.parse(content.value.text);
    } catch {
        return content.value.text;
    }

    return generateHTML(text, [StarterKit]);
});
</script>

<template>
    <div class="hidden lg:block">
        <RouterLink
            to="/"
            class="-mx-2 mb-1 inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-500 dark:hover:text-zinc-50 dark:active:bg-zinc-400"
        >
            <ArrowLeftIcon class="h-4 w-4" /> Back
        </RouterLink>
    </div>

    <div v-if="isLoading">
        <LoadingSpinner />
    </div>
    <article v-else class="mx-auto mb-12 max-w-3xl">
        <VideoPlayer v-if="content.video" :content="content" />
        <img v-else :src="content.image" class="w-full rounded-lg object-cover shadow-md" />

        <h1 class="text-bold mt-4 text-center text-2xl text-zinc-800 dark:text-zinc-50">
            {{ content.title }}
        </h1>

        <div
            class="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-300"
            v-if="content.publishDate"
        >
            {{ db.toDateTime(content.publishDate!).toLocaleString(DateTime.DATETIME_MED) }}
        </div>

        <div class="mt-12 text-justify text-gray-800 dark:text-zinc-100" v-if="content.summary">
            {{ content.summary }}
        </div>

        <div
            v-if="content.text"
            v-html="text"
            class="prose prose-zinc mt-6 max-w-3xl text-justify dark:prose-invert"
        ></div>

        <div class="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-500">
            <h3 class="mb-2 text-sm text-zinc-600 dark:text-zinc-200">Tags</h3>
            <div class="flex gap-3">
                <span
                    v-for="tag in tagsContent"
                    :key="tag._id"
                    class="inline-block rounded bg-yellow-300 px-1.5 py-1 text-sm text-yellow-950 shadow"
                >
                    {{ tag.title }}
                </span>
            </div>
        </div>
    </article>
</template>
