<script setup lang="ts">
import { isTestEnviroment } from "@/globalConfig";
import { type Component } from "vue";

type Props = {
    to?: string | Component;
};

defineProps<Props>();
defineOptions({ inheritAttrs: false });
</script>

<template>
    <Teleport v-if="!isTestEnviroment" :to="to ?? 'body'">
        <slot />
    </Teleport>
    <!-- Test-only fallback (no real <Teleport>). inheritAttrs is false so the production <Teleport>
         branch — which cannot receive attributes — doesn't warn on fallthrough class/etc. Re-bind
         $attrs here so consumer attrs (e.g. the `name` some specs query on) still land on the node. -->
    <div v-else v-bind="$attrs">
        <slot />
    </div>
</template>
