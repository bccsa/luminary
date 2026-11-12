<script setup lang="ts">
/** Pulsing grey block that stands in for content still loading. Size and shape come from the caller's classes. */
</script>

<template>
    <div
        aria-hidden="true"
        data-test="ghost-placeholder"
        class="animate-pulse rounded bg-zinc-200 dark:bg-slate-700"
    ></div>
</template>
