<script setup lang="ts">
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { usePostStore } from "@/stores/post";
import { DateTime } from "luxon";
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const postStore = usePostStore();

const slug = route.params.slug as string;

const post = computed(() => postStore.post(slug));
</script>

<template>
    <div v-if="!post">
        <LoadingSpinner />
    </div>
    <article v-else class="mx-auto max-w-3xl">
        <img :src="post.image" class="rounded shadow-md" />
        <h1 class="mt-4 text-center text-2xl text-zinc-800">{{ post.content[0].title }}</h1>

        <div class="mt-2 text-center text-gray-800">
            {{ post.content[0].summary }}
        </div>

        <div v-if="post.content[0].text" class="mt-6">
            {{ post.content[0].text }}
        </div>

        <div class="mt-6">
            <h3 class="mb-1 text-sm text-zinc-600">Tags</h3>
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
