<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { db, DocType, type ContentDto, type Uuid } from "luminary-shared";
import { appLanguageIdAsRef, appName } from "@/globalConfig";
import { useRouter } from "vue-router";
import ContentTile from "@/components/content/ContentTile.vue";

const router = useRouter();

const { id } = router.currentRoute.value.params;

const parentTopic = ref<ContentDto[]>([]);

const relatedContent = db.contentWhereTagAsRef(id as Uuid, {
    languageId: appLanguageIdAsRef.value,
});

watchEffect(async () => {
    parentTopic.value = await db.whereParent(id, DocType.Tag, appLanguageIdAsRef.value);
    document.title = `${parentTopic.value[0].title} - ${appName}`;
});
</script>

<template>
    <div>
        <h1 class="mb-5 text-2xl font-semibold" v-for="content in parentTopic" :key="content._id">
            {{ content.title }}
        </h1>
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <ContentTile v-for="content in relatedContent" :key="content._id" :content="content" />
        </div>
    </div>
</template>
