<script setup lang="ts">
import { type Component } from "vue";

type Props = {
    to?: string | Component;
};

defineProps<Props>();

const isTestEnviroment = import.meta.env.MODE === "test";
</script>

<template>
    <Teleport
        v-if="!isTestEnviroment"
        :to="to ?? 'body'"
    >
        <slot />
    </Teleport>
    <div v-else>
        <slot />
    </div>
</template>
