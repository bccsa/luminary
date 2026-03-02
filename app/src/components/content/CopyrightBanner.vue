<script lang="ts" setup>
import { appLanguageIdsAsRef } from "@/globalConfig";
import { mangoIsPublished } from "@/util/mangoIsPublished";
import { useDexieLiveQuery, db, mangoToDexie, type ContentDto } from "luminary-shared";
import { computed } from "vue";

const copyright = useDexieLiveQuery(() =>
    mangoToDexie<ContentDto>(db.docs, {
        selector: {
            $and: [
                { parentId: import.meta.env.VITE_COPYRIGHT_ID },
                ...mangoIsPublished(appLanguageIdsAsRef.value),
            ],
        },
        $limit: 1,
    }).then((docs) => docs[0] as ContentDto | undefined),
);

const copyrightContent = computed(() => copyright.value?.text ?? "");
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
