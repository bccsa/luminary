<script setup lang="ts">
import { ref, type FunctionalComponent } from "vue";
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
} from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import { type Notification, useNotificationStore } from "@/stores/notification";
import { RouterLink, useRouter } from "vue-router";

type Props = {
    notification: Notification;
};

const props = defineProps<Props>();

const router = useRouter();

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
            icon.value = InformationCircleIcon;
            break;
        case "warning":
            icon.value = ExclamationTriangleIcon;
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

const handleNotificationClick = (notification: Notification) => {
    if (typeof notification.link === "function") {
        notification.link(); // Executes custom function
    } else if (typeof notification.link === "object") {
        router.push(notification.link); // Navigates to route
    }
};
</script>

<template>
    <div v-if="show" class="inset-x-0 text-zinc-900" :class="color">
        <div
            class="flex items-center justify-between px-5 py-1"
            @click="() => handleNotificationClick(notification)"
            :class="{ 'cursor-pointer': notification.link }"
        >
            <!-- Conditional rendering for RouterLink or div -->
            <component
                :is="
                    notification.link && typeof notification.link === 'object' ? RouterLink : 'div'
                "
                :to="
                    notification.link && typeof notification.link === 'object'
                        ? notification.link
                        : undefined
                "
                @click.stop="() => handleNotificationClick(notification)"
                class="flex flex-1 items-center gap-1"
                :class="{ 'cursor-pointer': notification.link }"
            >
                <component :is="icon" class="mr-4 h-5 w-5 min-w-5" />
                <div class="flex flex-1 flex-col">
                    <span class="text-md md:text-sm">{{ notification.title }}</span>
                    <span v-if="notification.description" class="w-full break-words text-xs">
                        {{ notification.description }}
                    </span>
                </div>
            </component>

            <!-- Close Button -->
            <button
                type="button"
                @click.stop="notification.id ? removeNotification(notification.id) : (show = false)"
                class="ml-4 h-6 min-h-6 w-6 min-w-6 cursor-pointer underline md:h-5 md:min-h-5 md:w-5 md:min-w-5"
                data-test="banner-close-button"
                v-if="notification.closable"
            >
                <span class="sr-only">Close</span>
                <XMarkIcon class="h-5 w-5" aria-hidden="true" />
            </button>
        </div>
    </div>
</template>
