<script setup lang="ts">
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import VideoPlayer from "@/components/posts/VideoPlayer.vue";
import { usePostStore } from "@/stores/post";
import { computed, onMounted, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { DateTime } from "luxon";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { watchEffectOnceAsync } from "@/util/watchEffectOnce";
import { storeToRefs } from "pinia";

const route = useRoute();
const postStore = usePostStore();
const { posts } = storeToRefs(postStore);
const { appName } = useGlobalConfigStore();
const router = useRouter();

const slug = route.params.slug as string;

const post = computed(() => postStore.post(slug));

const showPublishDate = computed(
    () => post.value?.content[0].publishDate && post.value?.tags.some((tag) => !tag.pinned),
);

const loadDocumentNameOrRedirect = async () => {
    if (post.value) {
        document.title = `${post.value.content[0].title} - ${appName}`;
    } else {
        await router.push({ name: "home" });
    }
};

onMounted(async () => {
    if (posts.value != undefined) {
        return await loadDocumentNameOrRedirect();
    }

    await watchEffectOnceAsync(() => posts.value != undefined);

    await loadDocumentNameOrRedirect();
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
    <div v-if="!post">
        <LoadingSpinner />
    </div>
    <article v-else class="mx-auto mb-12 max-w-3xl">
        <VideoPlayer v-if="post.content[0].video" :content-parent="post" />
        <img v-else :src="post.image" class="rounded-lg shadow-md" />

        <h1 class="mt-4 text-center text-2xl text-zinc-800 dark:text-zinc-50">
            {{ post.content[0].title }}
        </h1>

        <div
            class="mt-1 text-center text-sm text-zinc-500 dark:text-zinc-300"
            v-if="showPublishDate"
        >
            {{ post.content[0].publishDate?.toLocaleString(DateTime.DATE_FULL) }}
        </div>

        <div
            class="mt-2 text-center text-gray-800 dark:text-zinc-100"
            v-if="post.content[0].summary"
        >
            {{ post.content[0].summary }}
        </div>

        <div
            v-if="post.content[0].text"
            v-html="post.content[0].text"
            class="prose mt-6 dark:text-zinc-50"
        ></div>

        <div class="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-500">
            <h3 class="mb-2 text-sm text-zinc-600 dark:text-zinc-200">Tags</h3>
            <div class="flex gap-3">
                <span
                    v-for="tag in post.tags"
                    :key="tag._id"
                    class="inline-block rounded bg-yellow-300 px-1.5 py-1 text-sm text-yellow-950 shadow"
                >
                    {{ tag.content[0].title }}
                </span>
            </div>
        </div>
    </article>
</template>
