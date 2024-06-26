<script setup lang="ts">
import { db, type PostDto, type TagDto, type Uuid } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockData";
import VideoPlayer from "@/components/posts/VideoPlayer.vue";
import { computed, ref } from "vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { useRouter } from "vue-router";
import { DateTime } from "luxon";

type Props = {
    slug: string;
};
const props = defineProps<Props>();

// const { appName } = useGlobalConfigStore();
// const router = useRouter();
const contentDocs = db.getBySlugAsRef(props.slug, mockEnglishContentDto);

const text = computed(() => {
    if (!contentDocs.value.text) {
        return undefined;
    }

    let text;

    // Only parse text with TipTap if it's JSON, otherwise we render it out as HTML
    try {
        text = JSON.parse(contentDocs.value.text);
    } catch {
        return contentDocs.value.text;
    }

    return generateHTML(text, [StarterKit]);
});

// const loadDocumentNameOrRedirect = async () => {
//     if (contentDocs.value) {
//         document.title = `${contentDocs.value.title} - ${appName}`;
//     } else {
//         await router.push({ name: "home" });
//     }
// };
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
    <div v-if="!contentDocs">
        <LoadingSpinner />
    </div>
    <article v-else class="mx-auto mb-12 max-w-3xl">
        <!-- <VideoPlayer
            v-if="contentDocs.video"
            :content-parent="contentParent"
            :content="contentDocs"
        />
        <img v-else :src="contentParent.image" class="rounded-lg shadow-md" /> -->

        <h1 class="mt-4 text-center text-2xl text-zinc-800 dark:text-zinc-50">
            {{ contentDocs.title }}
        </h1>

        <div
            class="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-300"
            v-if="contentDocs.publishDate"
        >
            {{ db.toDateTime(contentDocs.publishDate!).toLocaleString(DateTime.DATETIME_MED) }}
        </div>

        <div class="mt-2 text-justify text-gray-800 dark:text-zinc-100" v-if="contentDocs.summary">
            {{ contentDocs.summary }}
        </div>

        <div
            v-if="contentDocs.text"
            v-html="text"
            class="prose prose-zinc mt-6 text-justify dark:prose-invert"
        ></div>

        <!-- <div class="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-500">
            <h3 class="mb-2 text-sm text-zinc-600 dark:text-zinc-200">Tags</h3>
            <div class="flex gap-3">
                <span
                    v-for="tag in contentDocs.tags"
                    :key="tag"
                    class="inline-block rounded bg-yellow-300 px-1.5 py-1 text-sm text-yellow-950 shadow"
                >
                    {{ tag }}
                </span>
            </div>
        </div> -->
    </article>
</template>
