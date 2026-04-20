<script setup lang="ts">
import LTeleport from "@/components/common/LTeleport.vue";

const isVisible = defineModel<boolean>("isVisible");
const emit = defineEmits(["close"]);
</script>

<template>
    <LTeleport v-if="isVisible">
        <div
            class="fixed inset-0 z-[100] flex items-center justify-center rounded-lg bg-zinc-800 bg-opacity-50 p-2 backdrop-blur-sm dark:bg-slate-800 dark:bg-opacity-50"
            @mousedown.self="emit('close')"
            data-test="modal-container"
        >
            <slot />
        </div>
    </LTeleport>
</template>
