<script setup lang="ts">
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading?: string;
    adaptiveSize?: boolean;
    noPadding?: boolean;
};
defineProps<Props>();

const isVisible = defineModel<boolean>("isVisible");
const isTestEnvironment = import.meta.env.MODE === "test";
</script>

<template>
    <div
        v-if="isVisible"
        v-bind="isTestEnvironment ? {} : { teleport: { to: App } }"
        @click="isVisible = false"
    >
        <!-- Overlay -->
        <div class="fixed inset-0 z-50 bg-zinc-800 bg-opacity-50 backdrop-blur-sm"></div>
        <!-- Modal Container -->
        <div
            class="fixed inset-0 z-50 flex items-center justify-center"
            :class="{ 'p-2': !noPadding }"
        >
            <div
                :class="[
                    'w-full rounded-lg bg-white/90 shadow-xl',
                    adaptiveSize
                        ? 'max-h-[90vh] min-h-[200px] min-w-[320px] max-w-[90vw] overflow-y-auto'
                        : 'max-h-screen max-w-md',
                    noPadding ? 'p-0' : 'p-5',
                ]"
                @click.stop
            >
                <h2 v-if="heading" :class="['text-lg font-semibold', noPadding ? 'm-0' : 'mb-4']">
                    {{ heading }}
                </h2>
                <div :class="{ 'divide-y divide-zinc-200': !noPadding }">
                    <slot></slot>
                </div>
                <div :class="{ 'mt-4': !noPadding }">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </LTeleport>
</template>
