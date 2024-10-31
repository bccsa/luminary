<script setup lang="ts">
import { appLanguageIdAsRef } from "@/globalConfig";
import HomePageContent from "./HomePageContent.vue";
</script>

<template>
    <Suspense>
        <HomePageContent :key="appLanguageIdAsRef" class="mb-4" />
    </Suspense>
</template>
