<script setup lang="ts">
import { type ContentDto, type LanguageDto } from "luminary-shared";
import LCard from "@/components/common/LCard.vue";
import RichTextEditor from "../editor/RichTextEditor.vue";

type Props = {
    selectedLanguage: LanguageDto;
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <div v-if="content">
        <LCard :title="`${selectedLanguage.name}`" class="h-[calc(100vh-5rem)] bg-white">
            <RichTextEditor
                v-model:text="content.text"
                :disabled="disabled"
                data-test="richTextEditor"
            />
        </LCard>
    </div>
</template>
