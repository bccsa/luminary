<script setup lang="ts">
import App from "@/App.vue";

type Props = {
    heading: string;
};
defineProps<Props>();

const isVisible = defineModel<boolean>("isVisible");
const isTestEnviroment = import.meta.env.MODE === "test";
const emit = defineEmits(["close"]);
</script>

<template>
    <div
        v-if="isVisible"
        v-bind="isTestEnviroment ? {} : { teleport: { to: App } }"
        @click="emit('close')"
    >
        <div class="fixed inset-0 z-50 bg-zinc-800 bg-opacity-50 backdrop-blur-sm"></div>
        <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
            <div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-700">
                <h2 class="mb-4 text-lg font-semibold">{{ heading }}</h2>
                <div class="divide-y divide-zinc-200 dark:divide-slate-600">
                    <slot></slot>
                </div>
                <div class="mt-4">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </div>
</template>
