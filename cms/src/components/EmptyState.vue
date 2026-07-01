<script setup lang="ts">
import { PlusIcon } from "@heroicons/vue/20/solid";
import { ArrowLeftIcon, DocumentPlusIcon } from "@heroicons/vue/24/outline";
import type { Component } from "vue";
import LButton from "@/components/button/LButton.vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import { useGoBackOrHome } from "@/composables/useGoBackOrHome";

withDefaults(
    defineProps<{
        title: string;
        description: string;
        icon?: string | Component | Function;
        buttonText?: string;
        buttonAction?: Function;
        buttonLink?: RouteLocationRaw;
        buttonPermission?: boolean;
        showBackButton?: boolean;
    }>(),
    {
        buttonPermission: true,
        showBackButton: false,
    },
);

const goBackOrHome = useGoBackOrHome();
</script>

<template>
    <div class="mx-3 rounded-md border-2 border-dashed border-zinc-200 py-12 text-center lg:mx-0">
        <component
            :is="icon ?? DocumentPlusIcon"
            class="mx-auto h-10 w-10 text-zinc-400"
            aria-hidden="true"
        />
        <h3 class="mt-2 text-sm font-semibold text-zinc-900">{{ title }}</h3>
        <p class="mt-1 text-sm text-zinc-500">{{ description }}</p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
            <LButton
                v-if="showBackButton"
                variant="secondary"
                size="lg"
                :icon="ArrowLeftIcon"
                @click="goBackOrHome"
            >
                Go back
            </LButton>
            <LButton
                v-if="buttonText && (buttonAction || buttonLink) && buttonPermission"
                @click="buttonAction ? buttonAction() : ''"
                :is="buttonLink ? RouterLink : 'button'"
                :to="buttonLink"
                :icon="PlusIcon"
                variant="primary"
                size="lg"
            >
                {{ buttonText }}
            </LButton>
            <slot />
        </div>
    </div>
</template>
