q
<script setup lang="ts">
import LNotification from "./LNotification.vue";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";

const { notifications } = storeToRefs(useNotificationStore());

type Props = {
    type: "toast" | "banner";
};
defineProps<Props>();
</script>

<template>
    <div
        aria-live="assertive"
        class="pointer-events-none fixed inset-0 top-12 z-50 flex items-end px-4 py-6 sm:items-start sm:p-6"
        v-if="type == 'toast'"
    >
        <div class="flex w-full flex-col items-center space-y-4 sm:items-end">
            <TransitionGroup
                enter-active-class="transform ease-out duration-300 transition"
                enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
                enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
                leave-active-class="transition ease-in duration-100"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
            >
                <LNotification
                    v-for="notification in notifications.filter((c) => c.type == 'toast')"
                    :key="notification.id"
                    :notification
                />
            </TransitionGroup>
        </div>
    </div>
    <div
        aria-live="assertive"
        class="fixed inset-x-0 top-12 my-6 flex items-end sm:items-start"
        v-if="type == 'banner'"
    >
        <div class="w-full">
            <LNotification
                v-for="notification in notifications.filter((c) => c.type == 'banner')"
                :key="notification.id"
                :notification
            />
        </div>
    </div>
</template>
