<script setup lang="ts">
import { useLazyVisible } from "@/composables/useLazyVisible";

const props = withDefaults(defineProps<{ rootMargin?: string }>(), { rootMargin: "300px" });
const { root, isVisible } = useLazyVisible(props.rootMargin);
</script>

<template>
    <!-- Defers mounting the slot content (and whatever composables/DB queries/FTS work it
         runs in setup()) until this placeholder scrolls near the viewport. A v-if higher up
         only hides a template branch — its composables still run at that ancestor's mount.
         Actually not-mounting the child until needed is what keeps below-the-fold rows from
         competing with the article's own render on load. -->
    <div ref="root">
        <slot v-if="isVisible" />
    </div>
</template>
