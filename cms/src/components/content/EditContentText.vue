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
        <LCard class="h-max bg-white pt-2">
            <RichTextEditor
                class="mb-16"
                v-model:text="content.text"
                :disabled="disabled"
                data-test="richTextEditor"
            />
        </LCard>
    </div>
</template>
