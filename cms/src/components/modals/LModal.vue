<script setup lang="ts">
import LTeleport from "../common/LTeleport.vue";

type Props = {
    heading: string;
};
defineProps<Props>();

const isVisible = defineModel<boolean>("isVisible");
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-800 bg-opacity-50 p-2 backdrop-blur-sm"
            @click.self="isVisible = false"
            @touchmove.prevent
            @wheel.stop
            @touchmove.stop
            @wheel.prevent
        >
            <!-- Modal content at higher z-index -->
            <div
                class="relative z-50 max-h-screen w-full max-w-md rounded-lg bg-white/90 p-5 shadow-xl"
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
    </LTeleport>
</template>
