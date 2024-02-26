<script setup lang="ts">
import { PlusIcon } from "@heroicons/vue/20/solid";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";
import type { Component } from "vue";
import LButton from "@/components/button/LButton.vue";
import { RouterLink } from "vue-router";

defineProps<{
    title: string;
    description: string;
    icon?: string | Component | Function;
    buttonText?: string;
    buttonAction?: Function;
    buttonLink?: string | { name: string };
}>();
</script>

<template>
    <div class="rounded border-2 border-dashed border-gray-200 py-12 text-center">
        <component
            :is="icon ?? DocumentPlusIcon"
            class="mx-auto h-10 w-10 text-gray-400"
            aria-hidden="true"
        />
        <h3 class="mt-2 text-sm font-semibold text-gray-900">{{ title }}</h3>
        <p class="mt-1 text-sm text-gray-500">{{ description }}</p>
        <div class="mt-6">
            <LButton
                v-if="buttonText && (buttonAction || buttonLink)"
                @click="buttonAction ? buttonAction() : ''"
                :is="buttonLink ? RouterLink : 'button'"
                :to="buttonLink"
                :icon="PlusIcon"
                variant="primary"
                size="lg"
            >
                {{ buttonText }}
            </LButton>
        </div>
    </div>
</template>
@/components/button/LButton.vue
