<script setup lang="ts">
import NotificationBanner from "./NotificationBanner.vue";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const { notifications } = storeToRefs(useNotificationStore());
</script>

<template>
    <div aria-live="assertive" class="sticky inset-x-0 flex items-end sm:items-start">
        <div class="w-full">
            <NotificationBanner
                v-for="banner in notifications.filter((c) => c.type == 'banner')"
                :key="banner.id"
                :notification="banner"
            />
        </div>
    </div>
</template>
