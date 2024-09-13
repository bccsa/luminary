<script setup lang="ts">
import { toRefs } from "vue";
import { db, DocType, type Uuid } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { useRouter } from "vue-router";
import ContentTile from "@/components/content/ContentTile.vue";

const router = useRouter();

const { id } = toRefs(router.currentRoute.value.params);

const parentTopic = db.whereParentAsRef(id.value as Uuid, DocType.Tag, appLanguageIdAsRef.value);

const relatedContent = db.contentWhereTagAsRef(id.value as Uuid, {
    languageId: appLanguageIdAsRef.value,
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
