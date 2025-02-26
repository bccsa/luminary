<script setup lang="ts">
import App from "@/App.vue";

type Props = {
    heading: string;
    withBackground?: boolean;
    size?: "default" | "small" | "medium" | "large" | "xlarge";
};
const props = withDefaults(defineProps<Props>(), {
    withBackground: true,
    size: "default",
});

const isVisible = defineModel<boolean>("isVisible");
const isTestEnviroment = import.meta.env.MODE === "test";
const emit = defineEmits(["close"]);

const sizeClasses = {
    default: "max-w-md",
    small: "max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl",
    medium: "max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl",
    large: "max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl",
    xlarge: "max-w-2xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl",
};
</script>

<template>
    <div
        v-if="isVisible"
        v-bind="isTestEnviroment ? {} : { teleport: { to: App } }"
        @click="emit('close')"
    >
        <div
            class="fixed inset-0 z-50 bg-zinc-800 bg-opacity-50 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
        ></div>
        <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
            <div
                class="max-h-screen w-full rounded-lg"
                :class="[
                    sizeClasses[props.size],
                    props.withBackground !== false
                        ? 'bg-white/90 p-5 shadow-xl dark:bg-slate-700/85'
                        : '',
                ]"
                @click.stop
            >
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
