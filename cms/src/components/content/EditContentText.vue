<script setup lang="ts">
import { type ContentDto, type LanguageDto } from "luminary-shared";
import LCard from "@/components/common/LCard.vue";
import RichTextEditor from "../editor/RichTextEditor.vue";

type Props = {
    selectedLanguage?: LanguageDto;
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <div v-if="content">
        <LCard class="h-max bg-white pt-0 sm:h-[calc(100vh-5rem)] lg:pt-2">
            <RichTextEditor
                class="mb-0 lg:mb-16"
                v-model:text="content.text"
                v-model:text-language="content.language"
                :disabled="disabled"
                data-test="richTextEditor"
            />
        </LCard>
    </div>
</template>
