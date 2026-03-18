<script setup lang="ts">
import { type ContentDto, type LanguageDto } from "luminary-shared";
import LCard from "@/components/common/LCard.vue";
import RichTextEditor from "../editor/RichTextEditor.vue";

type Props = {
    selectedLanguage?: LanguageDto;
    disabled: boolean;
    isLanguageSelectorCollapsed?: boolean;
};
const props = defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <div v-if="content">
        <LCard
            class="bg-white pt-0 lg:pt-2"
            :class="props.isLanguageSelectorCollapsed ? 'h-[calc(100dvh-7rem)] lg:h-[calc(100vh-5rem)]' : 'h-max sm:h-[calc(100vh-5rem)]'"
        >
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
