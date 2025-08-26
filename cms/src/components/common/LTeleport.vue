<script setup lang="ts">
import { isTestEnviroment } from "@/globalConfig";
import { type Component } from "vue";

type Props = {
    to?: string | Component;
};

defineProps<Props>();
</script>

<template>
    <Teleport v-if="!isTestEnviroment" :to="to ?? 'body'">
        <div>
            <slot />
        </div>
    </Teleport>
    <div v-else>
        <slot />
    </div>
</template>
