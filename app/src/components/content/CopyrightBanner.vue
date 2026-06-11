<script lang="ts" setup>
import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";

const copyright = useContentQuery(() => [{ parentId: import.meta.env.VITE_COPYRIGHT_ID }], {
    includeScheduled: false,
    limit: 1,
    // Seek by parentId; the publishDate sort is required to engage the index.
    useIndex: "content-parentId-publishDate-index",
    sort: [{ publishDate: "desc" }],
});

const copyrightContent = computed(() => copyright.value[0]?.text ?? "");
</script>

<template>
    <div>
        <div
            v-if="copyrightContent"
            v-html="copyrightContent"
            class="text-md prose prose-zinc max-w-full border-t-zinc-100/25 bg-zinc-100/50 px-4 py-2 dark:prose-invert dark:border-t-slate-700/50 dark:bg-slate-800/50"
        ></div>
    </div>
</template>
