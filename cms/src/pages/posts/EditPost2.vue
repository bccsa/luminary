<script setup lang="ts">
import EditContent from "@/components/content/EditContent.vue";
import { DocType, type Uuid } from "@/types";
import { useRoute } from "vue-router";

const route = useRoute();

const parentId = route.params.id as Uuid;
const routeLanguage = route.params.language as string;
const docType = DocType.Post;
</script>

<template>
    <EditContent
        :parentId="parentId"
        :languageCode="routeLanguage"
        :docType="docType"
        routerBackLink="posts.index"
        backLinkText="Posts"
    />
</template>
