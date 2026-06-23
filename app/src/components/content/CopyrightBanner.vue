<script lang="ts" setup>
import { computed } from "vue";
import { useContentQuery } from "@/composables/useContentQuery";

// When VITE_COPYRIGHT_ID is unset there is no copyright page to seek. A
// `{ parentId: undefined }` clause serializes to `{}` over the wire, leaving the
// parentId index pinned with a publishDate sort but no parentId equality — which
// CouchDB rejects ("No index exists for this sort"). Match nothing via a
// provably-empty `$in` so HybridQuery short-circuits before any Dexie read or POST.
const copyrightId = import.meta.env.VITE_COPYRIGHT_ID;
const copyright = useContentQuery(
    () => (copyrightId ? [{ parentId: copyrightId }] : [{ parentId: { $in: [] } }]),
    {
        includeScheduled: false,
        limit: 1,
        // Seek by parentId; the publishDate sort is required to engage the index.
        useIndex: "content-parentId-publishDate-index",
        sort: [{ publishDate: "desc" }],
        // Keep `text` — the copyright body is rendered below; the default strips it.
        stripFields: ["fts", "ftsTokenCount", "memberOf", "_rev"],
    },
);

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
