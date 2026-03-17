<script setup lang="ts">
import { RTextEditor, type ToolbarItem } from "rte-vue";
import { ref, toRefs } from "vue";
import type { Component } from "vue";
import { type Editor } from "@tiptap/vue-3";
import { LinkSlashIcon, LinkIcon, ArrowUpTrayIcon } from "@heroicons/vue/20/solid";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LButton from "../button/LButton.vue";
import BulletlistIcon from "./icons/BulletListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";
import { useFileUpload } from "../../composables/useFileUpload";

type Props = {
    title?: string;
    icon?: Component;
    disabled: boolean;
};
const props = defineProps<Props>();
const { disabled } = toRefs(props);
const text = defineModel<string>("text");

const rteRef = ref<InstanceType<typeof RTextEditor> | undefined>(undefined);
const showModal = ref(false);
const url = ref("");

const { isProcessing, fullSrcText, handleSourceSelected } = useFileUpload();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDraggingOver = ref(false);

function triggerFileUpload() {
    fileInputRef.value?.click();
}

function getEditor(): Editor | undefined {
    const editorRef =
        (rteRef.value as { editor?: unknown } | undefined)?.editor ??
        (rteRef.value as { $?: { setupState?: { editor?: unknown } } } | undefined)?.$?.setupState
            ?.editor;
    if (editorRef && typeof editorRef === "object" && "value" in editorRef) {
        return (editorRef as { value?: unknown }).value as Editor | undefined;
    }
    return editorRef as Editor | undefined;
}

function insertHtmlIntoEditor(html: string) {
    const editor = getEditor();
    if (!editor) return;
    editor.commands.setContent(html, true);
}

async function processFile(file: File) {
    const success = await handleSourceSelected(file);
    if (success && fullSrcText.value) {
        insertHtmlIntoEditor(fullSrcText.value);
    }
}

async function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await processFile(file);
    input.value = "";
}

function handleDragOver(event: DragEvent) {
    if (Array.from(event.dataTransfer?.items ?? []).some((i) => i.kind === "file")) {
        isDraggingOver.value = true;
        event.preventDefault();
    }
}

function handleDragLeave(event: DragEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node)) {
        isDraggingOver.value = false;
    }
}

async function handleDrop(event: DragEvent) {
    isDraggingOver.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
        event.preventDefault();
        await processFile(file);
    }
}

const toolbarGrouping: ToolbarItem[][] = [
    ["bold", "italic", "strike"],
    ["heading2", "heading3", "heading4", "heading5"],
    ["bulletList", "orderedList"],
    ["link", "unlink"],
];

const toolbarClasses = {
    root: "-mx-4 flex h-full flex-col px-4",
    header: "flex items-center gap-2",
    icon: "h-6 w-6 text-zinc-600",
    title: "text-sm font-medium text-zinc-700",
    toolbar: "flex flex-nowrap overflow-x-auto scrollbar-hide gap-4",
    toolbarGroup: "flex shrink-0 pb-2 !gap-0 !rounded-md !overflow-hidden !shadow-none",
    button: "!rounded-none !border-0 !shadow-none !bg-zinc-100 px-2 py-1.5 text-sm text-zinc-700 hover:!bg-zinc-200 active:!bg-zinc-300 first:!rounded-l-md last:!rounded-r-md",
    buttonActive: "!bg-zinc-300",
    editor: "flex flex-1 flex-col min-h-0",
    editorContent:
        "prose overflow-hidden prose-zinc lg:prose-sm max-w-none p-3 ring-1 ring-inset border-0 focus:ring-2 focus:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus:ring-zinc-950 mb-1 flex-1 min-h-0 bg-white",
    placeholder: "text-zinc-400",
} as const;

function openLinkModal() {
    const editor = rteRef.value?.editor;
    if (!editor) return;
    const attrs = editor.getAttributes("link");
    url.value = attrs?.href ?? "";
    showModal.value = true;
}

function addLink() {
    const editor = rteRef.value?.editor;
    if (!editor || !url.value) return;
    const chain = (editor.chain() as any).focus();
    if (editor.isActive("link")) chain.extendMarkRange("link");
    chain.setLink({ href: url.value }).run();
    showModal.value = false;
}

function removeLink() {
    (rteRef.value?.editor?.chain() as any).focus().unsetLink().run();
}

function handleToolbarClick(item: ToolbarItem, runCommand: (item: ToolbarItem) => void) {
    if (item === "link") {
        openLinkModal();
        return;
    }
    if (item === "unlink") {
        removeLink();
        return;
    }
    runCommand(item);
}

defineExpose({
    get editor(): Editor | undefined {
        return getEditor();
    },
});
</script>

<template>
    <input
        ref="fileInputRef"
        type="file"
        accept=".docx,.odt,.odf,.txt"
        class="hidden"
        @change="handleFileInputChange"
    />
    <div
        class="relative"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <div
            v-if="isDraggingOver"
            class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-zinc-400 bg-zinc-100/80"
        >
            <p class="text-sm font-medium text-zinc-600">Drop file to insert content</p>
        </div>
        <RTextEditor
            ref="rteRef"
            v-bind="$attrs"
            v-model="text"
            content-format="html"
            :disabled="props.disabled"
            :toolbar-groups="toolbarGrouping"
            :class-names="toolbarClasses"
            :on-request-link="openLinkModal"
        >
            <template #toolbar="{ groups, isActive, isDisabled, getLabel, runCommand }">
                <div :class="toolbarClasses.toolbar">
                    <div
                        v-for="(group, gi) in groups"
                        :key="gi"
                        :class="toolbarClasses.toolbarGroup"
                    >
                        <button
                            v-for="item in group"
                            :key="item"
                            type="button"
                            :disabled="isDisabled(item)"
                            :title="getLabel(item)"
                            :class="[
                                toolbarClasses.button,
                                isActive(item) ? toolbarClasses.buttonActive : '',
                                isDisabled(item) ? 'cursor-not-allowed opacity-50' : '',
                            ]"
                            @click="
                                handleToolbarClick(
                                    item as ToolbarItem,
                                    runCommand as (item: ToolbarItem) => void,
                                )
                            "
                        >
                            <BulletlistIcon v-if="item === 'bulletList'" class="h-5 w-5" />
                            <NumberedListIcon v-else-if="item === 'orderedList'" class="h-5 w-5" />
                            <LinkIcon v-else-if="item === 'link'" class="h-5 w-5" />
                            <LinkSlashIcon v-else-if="item === 'unlink'" class="h-5 w-5" />
                            <span v-else>{{ getLabel(item) }}</span>
                        </button>
                    </div>
                    <div :class="toolbarClasses.toolbarGroup">
                        <button
                            type="button"
                            :disabled="props.disabled || isProcessing"
                            title="Upload file (.docx, .odt, .txt)"
                            :class="[
                                toolbarClasses.button,
                                props.disabled || isProcessing
                                    ? 'cursor-not-allowed opacity-50'
                                    : '',
                            ]"
                            @click="triggerFileUpload"
                        >
                            <ArrowUpTrayIcon class="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </template>
        </RTextEditor>
    </div>
    <LModal
        v-model:isVisible="showModal"
        heading="Add Link"
        @keydown.esc="showModal = false"
        @keydown.enter="addLink"
    >
        <LInput
            v-model="url"
            label="URL"
            name="url"
            placeholder="https://example.com"
            type="text"
            class="mb-4"
            :disabled="disabled"
        />

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton
                    v-model="url"
                    :disabled="!url"
                    @click="addLink"
                    variant="primary"
                    class="w-20"
                    type="button"
                    >Ok</LButton
                >
                <LButton @click="showModal = false" class="w-20" variant="secondary" type="button"
                    >Cancel</LButton
                >
            </div>
        </template>
    </LModal>
</template>

<style scoped>
:deep(.rte-editor) {
    border: 0;
    border-radius: 0;
    background: transparent;
}

:deep(.rte-editor-content) {
    height: 100%;
    display: flex;
    flex-direction: column;
}

:deep(.rte-editor-content .ProseMirror) {
    height: 100%;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    flex: 1;
    overflow-y: auto;
    outline: none;
}

:deep(.rte-editor-content .ProseMirror-focused) {
    outline: none;
}

:deep(.rte-editor-content .ProseMirror > :first-child) {
    margin-top: 0;
}
</style>
