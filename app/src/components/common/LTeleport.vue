<script setup lang="ts">
import { type Component } from "vue";
import { isTestEnviroment } from "@/globalConfig";

type Props = {
    to?: string | Component;
};

defineProps<Props>();
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
