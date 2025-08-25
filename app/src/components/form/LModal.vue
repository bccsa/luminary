<script setup lang="ts">
import App from "@/App.vue";

type Props = {
    heading: string;
    withBackground?: boolean;
    position?: "center" | "bottom" | "top";
    fullWidth?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    withBackground: true,
    position: "center",
    fullWidth: false,
});

const isVisible = defineModel<boolean>("isVisible");
const isTestEnviroment = import.meta.env.MODE === "test";
const emit = defineEmits(["close"]);

const positionClasses = {
    center: "items-center justify-center",
    bottom: "items-end justify-center",
    top: "items-start justify-center",
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
        <div
            class="fixed inset-0 z-50 flex rounded-lg p-0"
            :class="positionClasses[props.position]"
        >
            <div
                class="max-h-screen w-full rounded-lg"
                :class="[
                    props.fullWidth ? ' max-w-7xl' : 'max-w-md',
                    props.withBackground !== false
                        ? 'bg-white/90 p-5 shadow-xl dark:bg-slate-700/85'
                        : '',
                    props.position === 'bottom' ? 'mb-8' : '',
                    props.position === 'top' ? 'mt-5' : '',
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
