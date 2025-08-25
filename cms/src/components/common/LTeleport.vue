<script setup lang="ts">
import App from "@/App.vue";
import { Component } from "vue";

type Props = {
    to?: string | Component;
};

defineProps<Props>();

const isTestEnviroment = import.meta.env.MODE === "test";
</script>

<template>
    <Teleport v-if="isTestEnviroment" :to="to ?? App">
        <div>
            <slot />
        </div>
    </Teleport>
    <div v-else>
        <slot />
    </div>
</template>
