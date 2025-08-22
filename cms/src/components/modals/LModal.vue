<script setup lang="ts">
import App from "@/App.vue";

type Props = {
    heading: string;
};
defineProps<Props>();

const isVisible = defineModel<boolean>("isVisible");
const isTestEnviroment = import.meta.env.MODE === "test";
</script>

<template>
    <Teleport v-if="!isTestEnviroment && isVisible" to="body">
        <div @click="isVisible = false">
            <div class="fixed inset-0 z-50 bg-zinc-800 bg-opacity-50 backdrop-blur-sm"></div>
            <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
                <div
                    class="max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl"
                    @click.stop
                >
                    <h2 class="mb-4 text-lg font-semibold">{{ heading }}</h2>
                    <div class="divide-y divide-zinc-200">
                        <slot></slot>
                    </div>
                    <div class="mt-4">
                        <slot name="footer"></slot>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
    <div v-if="isTestEnviroment && isVisible" @click="isVisible = false">
        <!-- Same modal content as above, but not teleported in test mode -->
        <div class="fixed inset-0 z-50 bg-zinc-800 bg-opacity-50 backdrop-blur-sm"></div>
        <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
            <div
                class="max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl"
                @click.stop
            >
                <h2 class="mb-4 text-lg font-semibold">{{ heading }}</h2>
                <div class="divide-y divide-zinc-200">
                    <slot></slot>
                </div>
                <div class="mt-4">
                    <slot name="footer"></slot>
                </div>
            </div>
        </div>
    </div>
</template>
