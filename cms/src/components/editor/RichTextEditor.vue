<script setup lang="ts">
import { RTextEditor, type ToolbarItem } from "rte-vue";
import { ref, toRefs } from "vue";
import type { Component } from "vue";
import { type Editor } from "@tiptap/vue-3";
import { LinkSlashIcon, LinkIcon } from "@heroicons/vue/20/solid";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LButton from "../button/LButton.vue";
import BulletlistIcon from "./icons/BulletListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";

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
    toolbar: "flex flex-wrap gap-4",
    toolbarGroup: "flex pb-2 !gap-0 !rounded-md !overflow-hidden !shadow-none",
    button: "!rounded-none !border-0 !shadow-none !bg-zinc-100 px-2 py-1.5 text-sm text-zinc-700 hover:!bg-zinc-200 active:!bg-zinc-300 first:!rounded-l-md last:!rounded-r-md",
    buttonActive: "!bg-zinc-300",
    editor: "flex flex-1 flex-col",
    editorContent:
        "prose sm:min-h-[calc(100vh-10rem)] min-h-[calc(100vh-20rem)] max-h-[calc(100vh-20rem)] sm:max-h-[calc(100vh-10rem)] overflow-hidden prose-zinc lg:prose-sm max-w-none p-3 ring-1 ring-inset border-0 focus:ring-2 focus:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus:ring-zinc-950 mb-1 flex-1 bg-white",
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
        const editorRef =
            (rteRef.value as { editor?: unknown } | undefined)?.editor ??
            (rteRef.value as { $?: { setupState?: { editor?: unknown } } } | undefined)?.$
                ?.setupState?.editor;
        if (editorRef && typeof editorRef === "object" && "value" in editorRef) {
            return (editorRef as { value?: unknown }).value as Editor | undefined;
        }
        return editorRef as Editor | undefined;
    },
});
</script>

<template>
    <RTextEditor
        ref="rteRef"
        v-bind="$attrs"
        v-model="text"
        :disabled="props.disabled"
        :toolbar-groups="toolbarGrouping"
        :class-names="toolbarClasses"
        :on-request-link="openLinkModal"
    >
        <template #toolbar-button="{ item, label, active, disabled: isDisabled, runCommand }">
            <button
                type="button"
                :disabled="isDisabled"
                :title="label"
                :class="[
                    toolbarClasses.button,
                    active ? toolbarClasses.buttonActive : '',
                    isDisabled ? 'cursor-not-allowed opacity-50' : '',
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
                <span v-else>{{ label }}</span>
            </button>
        </template>
    </RTextEditor>
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
