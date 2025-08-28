<script setup lang="ts">
import { ref, type FunctionalComponent } from "vue";
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
} from "@heroicons/vue/24/outline";
import { type Notification } from "@/stores/notification";

type Props = {
    notification: Notification;
};

const props = defineProps<Props>();

const icon = ref<FunctionalComponent>();

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
</script>

<template>
    <div
        class="flex flex-col items-start justify-between space-x-4 border-t-2 border-t-zinc-100/25 bg-yellow-500/10 px-4 py-4 dark:border-t-slate-700/50 dark:bg-yellow-500/5 md:flex-row md:items-center"
    >
        <div class="flex-col md:mb-0">
            <p class="mb-2 font-bold">{{ props.notification.title }}</p>

            <p class="text-sm">{{ props.notification.description }}</p>
        </div>
        <div class="w-full text-nowrap md:w-auto">
            <!-- Render actions slot or dynamic actions from props -->
            <slot v-if="$slots.actions" name="actions" />
            <component :is="props.notification.actions" v-else-if="props.notification.actions" />
        </div>
    </div>
</template>
