<script setup lang="ts">
import { XCircleIcon } from "@heroicons/vue/20/solid";

defineProps<{
    errors: string[];
}>();
</script>

<template>
    <div v-if="errors?.length" class="mb-3">
        <div
            v-for="(error, idx) in errors"
            :key="idx"
            class="mb-1 flex items-center gap-2"
        >
            <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
            <p class="text-xs text-zinc-700">{{ error }}</p>
        </div>
    </div>
</template>
