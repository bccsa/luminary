<script setup lang="ts">
import App from "@/App.vue";

const isVisible = defineModel<boolean>("isVisible");
const isTestEnviroment = import.meta.env.MODE === "test";
const emit = defineEmits(["close"]);
</script>

<template>
    <div
        v-if="isVisible"
        v-bind="isTestEnviroment ? {} : { teleport: { to: App } }"
    >
        <div
            class="fixed inset-0 z-[100] bg-zinc-800 bg-opacity-50 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
            @click="emit('close')"
        ></div>
        <div
            class="fixed inset-0 z-[100] flex items-center justify-center rounded-lg p-2"
            @click.self="emit('close')"
        >
            <slot></slot>
        </div>
    </div>
</template>
