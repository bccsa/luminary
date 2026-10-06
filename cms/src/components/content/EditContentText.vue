<script setup lang="ts">
import { computed } from "vue";
import { type ContentDto, type LanguageDto } from "luminary-shared";
import RichTextEditor from "../editor/RichTextEditor.vue";

type Props = {
    selectedLanguage?: LanguageDto;
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Suggest the translation's title (or slug) as the download filename, stripped of
// characters that are invalid in filenames. Returns undefined when there is nothing
// usable so rte-vue falls back to its default "document".
const downloadFilename = computed(() => {
    const raw = content.value?.title?.trim() || content.value?.slug?.trim();
    if (!raw) return undefined;
    return (
        raw
            .replace(/[/\\?%*:|"<>]/g, "")
            .replace(/\s+/g, " ")
            .trim() || undefined
    );
});
</script>

<template>
    <div v-if="content" class="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <RichTextEditor
            class="h-full min-h-0 w-full flex-1 overflow-hidden"
            v-model:text="content.text"
            v-model:text-language="content.language"
            :download-filename="downloadFilename"
            :disabled="disabled"
            data-test="richTextEditor"
        />
    </div>
</template>
