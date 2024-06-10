<script setup lang="ts">
import ContentOverview from "@/components/content/ContentOverview.vue";
import { DocType } from "@/types";
</script>

<template>
    <ContentOverview :docType="DocType.Post" titleSingular="Post" titlePlural="Posts" />
</template>
