<script setup lang="ts">
import { PlusIcon } from "@heroicons/vue/20/solid";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";
import type { Component } from "vue";

defineProps<{
    title: string;
    description: string;
    icon?: string | Component | Function;
    buttonText?: string;
    buttonAction?: Function;
}>();
</script>

<template>
    <div class="rounded border-2 border-dashed py-12 text-center">
        <component
            :is="icon ?? DocumentPlusIcon"
            class="mx-auto h-10 w-10 text-gray-400"
            aria-hidden="true"
        />
        <h3 class="mt-2 text-sm font-semibold text-gray-900">{{ title }}</h3>
        <p class="mt-1 text-sm text-gray-500">{{ description }}</p>
        <div class="mt-6">
            <button
                v-if="buttonText && buttonAction"
                @click="buttonAction()"
                type="button"
                class="inline-flex items-center rounded-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-600"
            >
                <PlusIcon class="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
                {{ buttonText }}
            </button>
        </div>
    </div>
</template>
