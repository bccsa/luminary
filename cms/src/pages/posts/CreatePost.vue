<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import { ContentDto, DocType } from "@/types";
import { ref } from "vue";

const content = ref<Partial<ContentDto>>({
    type: DocType.Content,
});
</script>

<template>
    <BasePage title="Create Post">
        <ContentForm type="post" :dto="content" />
    </BasePage>
</template>
