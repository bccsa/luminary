<script setup lang="ts">
import { ref, type FunctionalComponent } from "vue";
import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import type { Notification } from "@/stores/notification";
import { isConnected } from "luminary-shared";

type Props = {
    notification: Notification;
};

const props = defineProps<Props>();

const show = ref(true);
const isBannerVisible = ref(isConnected);

const icon = ref<FunctionalComponent>();
if (props.notification.icon) {
    icon.value = props.notification.icon;
} else {
    switch (props.notification.state) {
        case "success":
            icon.value = CheckCircleIcon;
            break;
        case "error":
            icon.value = ExclamationCircleIcon;
            break;
        case "info":
            icon.value = ExclamationCircleIcon;
            break;
        case "warning":
            icon.value = ExclamationCircleIcon;
            break;
    }
}

const colour = ref<string>("bg-gray-100");
const textColor = ref<string>("text-gray-400");
switch (props.notification.state) {
    case "success":
        colour.value = "bg-green-100";
        textColor.value = "text-green-400";
        break;
    case "error":
        colour.value = "bg-red-100";
        textColor.value = "text-red-400";
        break;
    case "info":
        colour.value = "bg-blue-100";
        textColor.value = "text-blue-400";
        break;
    case "warning":
        colour.value = "bg-yellow-100";
        textColor.value = "text-yellow-400";
        break;
}
</script>

<template>
    <div
        v-if="show && notification.type == 'toast'"
        class="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5"
    >
        <div class="p-4">
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <component
                        :is="icon"
                        v-if="icon"
                        class="h-6 w-6"
                        :class="textColor"
                        aria-hidden="true"
                    />
                </div>
                <div class="ml-3 w-0 flex-1 pt-0.5">
                    <p class="text-sm font-medium text-zinc-900">{{ notification.title }}</p>
                    <p class="mt-1 text-sm text-zinc-500">
                        {{ notification.description }}
                    </p>
                </div>
                <div class="ml-4 flex flex-shrink-0">
                    <button
                        type="button"
                        @click="show = false"
                        class="inline-flex rounded-md bg-white text-zinc-400 hover:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        data-test="toast"
                    >
                        <span class="sr-only">Close</span>
                        <XMarkIcon class="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Banner -->
    <div
        v-if="!isBannerVisible && notification.type == 'banner'"
        class="inset-x-0 top-0 z-50 text-zinc-900"
        :class="bgColor"
    >
        <div class="flex items-center justify-between px-6 py-1 md:px-6 md:py-1">
            <div class="flex items-center gap-2">
                <component :is="icon" class="h-5 w-5" />
                <span class="text-md md:text-sm">{{ notification.title }}</span>
            </div>
            <XMarkIcon
                @click="isBannerVisible = true"
                class="h-6 w-6 cursor-pointer underline md:h-5 md:w-5"
            />
        </div>
    </div>
</template>
