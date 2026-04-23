<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { type ContentDto, type LanguageDto } from "luminary-shared";
import LCard from "@/components/common/LCard.vue";
import RichTextEditor from "../editor/RichTextEditor.vue";

type Props = {
    selectedLanguage?: LanguageDto;
    disabled: boolean;
    isLanguageSelectorCollapsed?: boolean;
    languageSelectorHeight?: number;
};
const props = defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Measure the topbar rather than hardcoding a magic number — h-12 with py-8 does
// not render at a predictable rem value, so a static subtraction leaves gap
// below the editor.
const topbarHeight = ref(0);
let topbarResizeObserver: ResizeObserver | undefined;

const measureTopbar = () => {
    const topbar = document.querySelector("[data-topbar]") as HTMLElement | null;
    if (!topbar) return;
    topbarHeight.value = topbar.getBoundingClientRect().height;
};

onMounted(() => {
    measureTopbar();
    const topbar = document.querySelector("[data-topbar]") as HTMLElement | null;
    if (topbar && typeof ResizeObserver !== "undefined") {
        topbarResizeObserver = new ResizeObserver(measureTopbar);
        topbarResizeObserver.observe(topbar);
    }
});

onUnmounted(() => {
    topbarResizeObserver?.disconnect();
});

const cardStyle = computed(() => ({
    "--topbar-height": `${topbarHeight.value}px`,
    "--selector-height": props.isLanguageSelectorCollapsed
        ? `${props.languageSelectorHeight ?? 0}px`
        : "0px",
}));
</script>

<template>
    <div v-if="content" class="fill-editor">
        <LCard
            class="flex flex-col bg-white pt-0 sm:h-[calc(100vh-5rem)] lg:h-[calc(100vh-5rem)] lg:pt-2"
            :class="
                isLanguageSelectorCollapsed
                    ? 'h-[calc(100dvh-var(--topbar-height,4rem)-var(--selector-height,0px))]'
                    : 'h-max'
            "
            :style="cardStyle"
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

<style scoped>
/* Chain `flex-1` through LCard's intermediate wrappers so the RichTextEditor
 * fills the card we've sized to the viewport, and release the hardcoded
 * min/max-h on the editor content so ProseMirror expands with it. */
.fill-editor :deep([data-test="collapsible-container"]) {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
}
.fill-editor :deep([data-test="collapsible-container"] > div) {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    flex-direction: column;
}
.fill-editor :deep(.rte-editor-content),
.fill-editor :deep(.prose) {
    min-height: 0 !important;
    max-height: none !important;
    flex: 1 1 auto;
}
</style>
