<script setup lang="ts">
import ContentTile from "@/components/content/ContentTile.vue";
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
        <ContentTile
            v-for="topic in topicContent"
            :key="topic._id"
            :content="topic"
            class="w-40 overflow-clip md:w-60"
        />
    </div>
</template>
