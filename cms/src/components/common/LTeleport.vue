<script setup lang="ts">
import App from "@/App.vue";
import { Component } from "vue";

type Props = {
    to?: string | Component;
};

withDefaults(defineProps<Props>(), {
    to: App,
});

const isTestEnviroment = import.meta.env.MODE === "test";
</script>

<template>
    <Teleport v-if="isTestEnviroment" :to="to">
        <div>
            <slot />
        </div>
    </Teleport>
    <div v-else>
        <slot />
    </div>
</template>
