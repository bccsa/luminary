<script lang="ts" setup>
import { appLanguageIdsAsRef } from "@/globalConfigOld";
import { firstLanguageSupported } from "@/util/firstSupportedLanguage";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { useDexieLiveQuery, db, type ContentDto } from "luminary-shared";
import { computed } from "vue";

const copyright = useDexieLiveQuery(
    () =>
        db.docs
            .where({
                parentId: import.meta.env.VITE_COPYRIGHT_ID,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (!content.availableTranslations) return false;
                if (
                    content.language ==
                    firstLanguageSupported(appLanguageIdsAsRef.value, content.availableTranslations)
                )
                    return true;

                return false;
            })
            .first() as unknown as ContentDto | undefined,
);

const copyrightContent = computed(() => {
    if (!copyright.value || !copyright.value.text) {
        return "";
    }

    let text;

    // only parse text with TipTap if it's JSON, otherwise we render it out as HTML
    try {
        text = JSON.parse(copyright.value.text);
    } catch {
        return copyright.value.text;
    }
    return generateHTML(text, [StarterKit]);
});
</script>

<template>
    <div>
        <div v-if="copyrightContent" v-html="copyrightContent"
            class="text-md prose prose-zinc max-w-full border-t-zinc-100/25 bg-zinc-100/50 px-4 py-2 dark:prose-invert dark:border-t-slate-700/50 dark:bg-slate-800/50">
        </div>
    </div>
</template>
