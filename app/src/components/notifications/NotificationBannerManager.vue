<script setup lang="ts">
import NotificationBanner from "./NotificationBanner.vue";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const { banners } = storeToRefs(useNotificationStore());
</script>

<template>
    <div aria-live="assertive" class="sticky inset-x-0 flex items-end sm:items-start">
        <div class="w-full">
            <NotificationBanner v-for="banner in banners" :key="banner.id" :notification="banner" />
        </div>
    </div>
</template>
