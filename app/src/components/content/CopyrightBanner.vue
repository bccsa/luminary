<script lang="ts" setup>
import { useGlobalCopyright } from "@/composables/useGlobalCopyright";

const { copyrightHtml } = useGlobalCopyright();
</script>

<template>
    <div>
        <div
            v-if="copyrightHtml"
            v-html="copyrightHtml"
            class="text-md prose prose-zinc max-w-full border-t-zinc-100/25 bg-zinc-100/50 px-4 py-2 dark:prose-invert dark:border-t-slate-700/50 dark:bg-slate-800/50"
        ></div>
    </div>
</template>
