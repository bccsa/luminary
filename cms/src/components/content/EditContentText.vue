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
        <LCard class="h-[770px] bg-white pt-2 sm:h-[calc(100vh-5rem)]">
            <RichTextEditor
                class="mb-16"
                v-model:text="content.text"
                v-model:text-language="content.language"
                :disabled="disabled"
                data-test="richTextEditor"
            />
        </LCard>
    </div>
</template>
