<script setup lang="ts">
import { computed } from "vue";
import { type ContentDto, type LanguageDto } from "luminary-shared";
import LCard from "@/components/common/LCard.vue";
import RichTextEditor from "../editor/RichTextEditor.vue";
import { lightPolish } from "./lightPolish";

type Props = {
    selectedLanguage?: LanguageDto;
    disabled: boolean;
    isLanguageSelectorCollapsed?: boolean;
    languageSelectorHeight?: number;
};
const props = defineProps<Props>();
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
    <div v-if="content">
        <LCard
            :bare="lightPolish"
            class="flex flex-col bg-white pt-0 lg:pt-2"
        >
            <RichTextEditor
                class="mb-0 lg:mb-16"
                v-model:text="content.text"
                v-model:text-language="content.language"
                :download-filename="downloadFilename"
                :disabled="disabled"
                data-test="richTextEditor"
            />
        </LCard>
    </div>
</template>
