<script setup lang="ts">
import { ref } from "vue";
import { XMarkIcon } from "@heroicons/vue/20/solid";

const visible = ref(true);

function dismiss() {
    visible.value = false;
}
</script>

<template>
    <div
        v-if="visible"
        class="relative z-40 flex items-center justify-between gap-3 bg-indigo-600 px-4 py-2 text-sm text-white"
        role="status"
    >
        <p>
            This banner is rendered by the
            <strong class="font-semibold">demo-banner</strong>
            build-time plugin — swap the plugin, swap the UI.
        </p>
        <button
            type="button"
            class="shrink-0 rounded p-1 hover:bg-indigo-500"
            aria-label="Dismiss banner"
            @click="dismiss"
        >
            <XMarkIcon class="h-5 w-5" />
        </button>
    </div>
</template>
