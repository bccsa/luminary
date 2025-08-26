<script setup lang="ts">
import App from "@/App.vue";
import { isTestEnviroment } from "@/globalConfig";
import { Component } from "vue";

type Props = {
    to?: string | Component;
};

defineProps<Props>();
</script>

<template>
    <Teleport v-if="!isTestEnviroment" :to="to ?? App">
        <div>
            <slot />
        </div>
    </Teleport>
    <div v-else>
        <slot />
    </div>
</template>
