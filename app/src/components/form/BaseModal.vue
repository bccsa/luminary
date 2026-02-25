<script setup lang="ts">
import LTeleport from "../common/LTeleport.vue";

const isVisible = defineModel<boolean>("isVisible");
const emit = defineEmits(["close"]);
</script>

<template>
    <LTeleport v-if="isVisible">
        <div class="relative z-[100]">
            <div
                class="fixed inset-0 bg-zinc-800 bg-opacity-50 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
                @click="emit('close')"
            ></div>
            <div
                class="fixed inset-0 flex items-center justify-center rounded-lg p-2"
                @click.self="emit('close')"
            >
                <slot />
            </div>
        </div>
    </LTeleport>
</template>
