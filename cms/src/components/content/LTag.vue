<script setup lang="ts">
import { XMarkIcon } from "@heroicons/vue/16/solid";

const emit = defineEmits(["remove"]);
</script>

<template>
    <div
        class="rounded-md border border-gray-200 bg-gray-50 py-1 pl-2 pr-1 text-sm text-gray-900 shadow-sm"
    >
        <div class="flex items-center gap-2">
            <slot />
            <button @click="emit('remove')" data-test="removeTag">
                <XMarkIcon class="h-4 w-4 text-gray-400 hover:text-gray-800" title="Remove tag" />
            </button>
        </div>
    </div>
</template>
