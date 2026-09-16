<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import NotFoundContent from "./NotFoundContent.vue";
</script>

<template>
    <!-- The page chrome lives here rather than in NotFoundContent, which SingleContent
         renders inside its own BasePage. -->
    <BasePage>
        <NotFoundContent />
    </BasePage>
</template>
