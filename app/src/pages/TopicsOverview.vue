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
    <div class="flex flex-wrap gap-4">
        <div
            class="ease-out-expo group aspect-video h-32 w-full transition hover:brightness-[1.15] sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5"
            v-for="topic in topicContent"
            :key="topic._id"
        >
            <RouterLink
                :to="{ name: 'topic-detail', params: { id: topic.parentId } }"
                class="avoid-inside hover:shadow-outline ease-out-expo relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg p-2 transition-transform duration-500 group-hover:scale-[101%]"
            >
                <!-- Commented out to fix build / test issues. This component will be changed in another PR -->
                <!-- <img
                    :src="topic.parentImage"
                    class="absolute h-full w-full object-cover object-center opacity-100 transition"
                /> -->
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
