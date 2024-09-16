<script setup lang="ts">
import { appLanguageIdAsRef } from "@/globalConfig";
import { db, DocType, TagType, type ContentDto } from "luminary-shared";
import { ref, watchEffect } from "vue";

// Fetch topics based on language
const topics = db.tagsWhereTagTypeAsRef(TagType.Topic, { languageId: appLanguageIdAsRef.value });

// Get content of topics
const topicContent = ref<ContentDto[]>([]);

watchEffect(async () => {
    const topicId = topics.value.map((t) => t._id);
    topicContent.value = await db.whereParent(topicId, DocType.Tag, appLanguageIdAsRef.value);
});
</script>

<template>
    <div>
        <h1 class="mb-8 text-3xl font-medium leading-tight md:text-4xl">Topics</h1>
    </div>

    <div class="flex flex-wrap gap-4">
        <div
            class="h-32 w-full sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5"
            v-for="topic in topicContent"
            :key="topic._id"
        >
            <RouterLink
                :to="{ name: 'topic-detail', params: { id: topic.parentId } }"
                class="avoid-inside hover:shadow-outline relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg p-2 transition duration-500 hover:z-40 hover:scale-110"
            >
                <img
                    :src="topic.parentImage"
                    class="absolute h-full w-full object-cover object-center"
                />
                <div class="absolute inset-0 bg-black opacity-50"></div>
                <h6
                    class="z-10 content-end break-words text-center text-sm font-bold leading-tight text-white"
                >
                    {{ topic.title }}
                </h6>
            </RouterLink>
        </div>
    </div>
</template>
