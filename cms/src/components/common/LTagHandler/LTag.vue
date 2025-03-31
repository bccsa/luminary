<script setup lang="ts">
import { XMarkIcon } from "@heroicons/vue/16/solid";
import type { Component } from "vue";

withDefaults(
    defineProps<{
        disabled?: boolean;
        icon?: Component | Function;
    }>(),
    {
        disabled: false,
    },
);

const emit = defineEmits(["remove"]);
</script>

<template>
    <div
        :class="[
            'flex gap-2 rounded-md border border-zinc-200 bg-zinc-50 py-1  pl-2 text-sm text-zinc-900 shadow-sm',
            disabled ? 'pr-2' : 'pr-1',
        ]"
    >
        <div v-if="icon" class="z-10 flex items-center">
            <component
                :is="icon"
                :class="{
                    'text-zinc-400': !disabled,
                    'text-zinc-300': disabled,
                }"
                class="h-5 w-5"
            />
        </div>
        <div class="flex items-center gap-2">
            <slot />
            <button @click="emit('remove')" data-test="removeTag" v-if="!disabled" type="button">
                <XMarkIcon class="h-4 w-4 text-zinc-400 hover:text-zinc-800" title="Remove tag" />
            </button>
        </div>
    </div>
</template>
