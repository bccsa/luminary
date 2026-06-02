<script setup lang="ts">
import { RTextEditor, type ToolbarItem, type DownloadFormat } from "rte-vue";
import { ref, toRefs, nextTick } from "vue";
import type { Component } from "vue";
import { type Editor } from "@tiptap/vue-3";
import {
    LinkSlashIcon,
    LinkIcon,
    ArrowUpTrayIcon,
    ArrowDownTrayIcon,
    ClipboardDocumentIcon,
} from "@heroicons/vue/20/solid";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LButton from "../button/LButton.vue";
import LDropdown from "../common/LDropdown.vue";
import BulletlistIcon from "./icons/BulletListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";
import { useNotificationStore } from "@/stores/notification";

type Props = {
    title?: string;
    icon?: Component;
    disabled: boolean;
    /** Base filename (without extension) suggested when downloading. Falls back to rte-vue's "document". */
    downloadFilename?: string;
};
const props = defineProps<Props>();
const { disabled } = toRefs(props);
const text = defineModel<string>("text");

const rteRef = ref<InstanceType<typeof RTextEditor> | undefined>(undefined);
const showModal = ref(false);
const url = ref("");

// Document types offered by the download button. rte-vue generates each natively
// (markdown via turndown; docx/odt/odf via its bundled converters).
const downloadFormats: DownloadFormat[] = [
    { id: "markdown", label: "Markdown (.md)", extension: "md", mimeType: "text/markdown" },
    { id: "docx", label: "Word (.docx)", extension: "docx" },
    { id: "odt", label: "OpenDocument Text (.odt)", extension: "odt" },
    { id: "odf", label: "OpenDocument (.odf)", extension: "odf" },
];
// rte-vue's download command saves `downloadFormats[0]` (and only fires when fewer than
// two formats are configured), so we feed it a single, chosen format on demand.
const activeDownloadFormat = ref<DownloadFormat>(downloadFormats[0]);
const showDownloadMenu = ref(false);

async function selectDownloadFormat(
    format: DownloadFormat,
    runCommand: (item: ToolbarItem) => void,
) {
    showDownloadMenu.value = false;
    activeDownloadFormat.value = format;
    // Let the new `download-formats` prop propagate before triggering the download.
    await nextTick();
    runCommand("download");
}

function getEditor(): Editor | undefined {
    return rteRef.value?.editor;
}

const toolbarGrouping: ToolbarItem[][] = [
    ["bold", "italic", "strike"],
    ["heading2", "heading3", "heading4", "heading5"],
    ["bulletList", "orderedList"],
    ["link", "unlink"],
    ["upload", "download", "copy"],
];

// Base button styling without the group edge-rounding. The first/last rounding is
// applied per-button in the toolbar slot so that a button nested inside a wrapper
// (e.g. the download dropdown trigger) stays square instead of rounding both edges.
const toolbarButtonClass =
    "!rounded-none !border-0 !shadow-none !bg-zinc-100 px-2 py-1.5 text-sm text-zinc-700 hover:!bg-zinc-200 active:!bg-zinc-300";

const toolbarClasses = {
    root: "-mx-4 flex h-full flex-col px-4",
    header: "flex items-center gap-2",
    icon: "h-6 w-6 text-zinc-600",
    title: "text-sm font-medium text-zinc-700",
    toolbar: "flex flex-nowrap overflow-x-auto scrollbar-hide gap-4",
    toolbarGroup: "flex shrink-0 pb-2 !gap-0 !rounded-md !overflow-hidden !shadow-none",
    button: `${toolbarButtonClass} first:!rounded-l-md last:!rounded-r-md`,
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
    <RTextEditor
        ref="rteRef"
        v-bind="$attrs"
        v-model="text"
        content-format="html"
        :disabled="props.disabled"
        :uploader="true"
        :downloader="true"
        :download-filename="props.downloadFilename"
        :download-formats="[activeDownloadFormat]"
        :copyable="true"
        :toolbar-groups="toolbarGrouping"
        :class-names="toolbarClasses"
        :on-request-link="openLinkModal"
        :heading-offset="1"
        :on-copy="
            () =>
                useNotificationStore().addNotification({
                    state: 'success',
                    title: 'Copied to clipboard',
                    description: 'The content was copied to your clipboard',
                })
        "
        :on-file-error="
            (error: Error) =>
                useNotificationStore().addNotification({
                    state: 'error',
                    title: 'File Upload Failed',
                    description: error.message,
                })
        "
    >
        <template #toolbar="{ groups, isActive, isDisabled, getLabel, runCommand }">
            <div :class="toolbarClasses.toolbar">
                <div v-for="(group, gi) in groups" :key="gi" :class="toolbarClasses.toolbarGroup">
                    <template v-for="item in group" :key="item">
                        <!-- Download: opens a menu to pick the document type -->
                        <LDropdown
                            v-if="item === 'download' && !isDisabled(item)"
                            v-model:show="showDownloadMenu"
                            placement="bottom-start"
                            padding="small"
                            width="auto"
                        >
                            <template #trigger>
                                <button
                                    type="button"
                                    :title="getLabel(item)"
                                    :class="toolbarButtonClass"
                                >
                                    <ArrowDownTrayIcon class="h-5 w-5" />
                                </button>
                            </template>
                            <button
                                v-for="format in downloadFormats"
                                :key="format.id"
                                type="button"
                                role="menuitem"
                                class="flex w-full items-center whitespace-nowrap rounded px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                                @click="
                                    selectDownloadFormat(
                                        format,
                                        runCommand as (item: ToolbarItem) => void,
                                    )
                                "
                            >
                                {{ format.label }}
                            </button>
                        </LDropdown>
                        <!-- Every other button (incl. download while the editor is empty) -->
                        <button
                            v-else
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
                            <ArrowUpTrayIcon v-else-if="item === 'upload'" class="h-5 w-5" />
                            <ArrowDownTrayIcon v-else-if="item === 'download'" class="h-5 w-5" />
                            <ClipboardDocumentIcon v-else-if="item === 'copy'" class="h-5 w-5" />
                            <span v-else>{{ getLabel(item) }}</span>
                        </button>
                    </template>
                </div>
            </div>
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
