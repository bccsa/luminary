<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { DocumentTextIcon } from "@heroicons/vue/20/solid";
import { type ContentDto } from "luminary-shared";
import RichTextEditor from "../editor/RichTextEditor.vue";

const EMPTY_TEXT = '{"type":"doc","content":[{"type":"paragraph"}]}';

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

const initializeText = () => {
    if (!content.value) return;
    content.value.text = EMPTY_TEXT;
};
</script>

<template>
    <LButton
        type="button"
        variant="tertiary"
        :icon="DocumentTextIcon"
        @click="initializeText"
        v-if="!content?.text && !disabled"
        data-test="addText"
    >
        Add text
    </LButton>
    <LCard
        title="Text content"
        :icon="DocumentTextIcon"
        collapsible
        v-if="content?.text"
        :disabled="disabled"
        data-test="textContent"
    >
        <RichTextEditor v-model:text="content.text" :disabled="disabled" :key="content._id" />
    </LCard>
</template>
