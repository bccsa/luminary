<script setup lang="ts">
import ContentOverview from "@/components/content/ContentOverview.vue";
import { DocType, TagType } from "@/types";
</script>

<template>
    <ContentOverview
        :docType="DocType.Tag"
        :tagType="TagType.Category"
        titleSingular="Category"
        titlePlural="Categories"
    />
</template>
