<script setup lang="ts">
import { ref, type FunctionalComponent } from "vue";
import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import { type Notification, useNotificationStore } from "@/stores/notification";
import { RouterLink } from "vue-router";

type Props = {
    notification: Notification;
};

const props = defineProps<Props>();

const show = ref(true);

const icon = ref<FunctionalComponent>();

const { removeNotification } = useNotificationStore();

if (props.notification.icon) {
    icon.value = props.notification.icon;
} else {
    switch (props.notification.state) {
        case "success":
            icon.value = CheckCircleIcon;
            break;
        case "error":
        case "info":
        case "warning":
            icon.value = ExclamationCircleIcon;
            break;
    }
}

const color = ref<string>("bg-gray-100");

switch (props.notification.state) {
    case "success":
        color.value = "bg-green-100";
        break;
    case "error":
        color.value = "bg-red-100";
        break;
    case "info":
        color.value = "bg-blue-100";
        break;
    case "warning":
        color.value = "bg-yellow-100";
        break;
}
</script>

<template>
    <div v-if="show" class="inset-x-0 top-0 z-50 text-zinc-900" :class="color">
        <div class="flex items-center justify-between px-6 py-1">
            <component
                :is="notification.routerLink ? RouterLink : 'div'"
                :to="notification.routerLink"
            >
                <div class="flex items-center gap-2">
                    <component :is="icon" class="h-5 w-5 min-w-5" />
                    <div class="flex flex-col md:inline-block md:align-middle">
                        <span class="text-md md:text-sm">{{ notification.title }}</span>
                        <span v-if="notification.description" class="text-xs md:ml-3">{{
                            notification.description
                        }}</span>
                    </div>
                </div>
            </component>

            <button
                type="button"
                @click="notification.id ? removeNotification(notification.id) : (show = false)"
                class="h-6 min-h-6 w-6 min-w-6 cursor-pointer underline md:h-5 md:min-h-5 md:w-5 md:min-w-5"
                data-test="banner-close-button"
            >
                <span class="sr-only">Close</span>
                <XMarkIcon class="h-5 w-5" aria-hidden="true" />
            </button>
        </div>
    </div>
</template>
