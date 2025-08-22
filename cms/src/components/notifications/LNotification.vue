<script setup lang="ts">
import { ref } from "vue";
import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import type { Notification } from "@/stores/notification";

type Props = {
    notification: Notification;
};

defineProps<Props>();

const show = ref(true);
</script>

<template>
    <div
        v-if="show"
        class="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5"
    >
        <div class="p-4">
            <div class="flex items-start">
                <div class="flex-shrink-0">
                    <CheckCircleIcon
                        class="h-6 w-6 text-green-400"
                        aria-hidden="true"
                        v-if="notification.state == 'success'"
                    />
                    <ExclamationCircleIcon
                        class="h-6 w-6"
                        aria-hidden="true"
                        :class="notification.state == 'error' ? 'text-red-400' : 'text-yellow-400'"
                        v-if="notification.state == 'error' || notification.state == 'warning'"
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
                    >
                        <span class="sr-only">Close</span>
                        <XMarkIcon class="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
