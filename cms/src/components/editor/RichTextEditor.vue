<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { computed, nextTick, ref, toRefs, watch } from "vue";
import BoldIcon from "./icons/BoldIcon.vue";
import ItalicIcon from "./icons/ItalicIcon.vue";
import StrikethroughIcon from "./icons/StrikethroughIcon.vue";
import BulletlistIcon from "./icons/BulletListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";
import Link from "@tiptap/extension-link";
import LModal from "../modals/LModal.vue";
import LInput from "../forms/LInput.vue";
import LButton from "../button/LButton.vue";
import { LinkSlashIcon, LinkIcon } from "@heroicons/vue/20/solid";
import FormLabel from "../forms/FormLabel.vue";

type Props = {
    title?: string;
    icon?: any;
    disabled: boolean;
};
const props = defineProps<Props>();
const { disabled } = toRefs(props);
const text = defineModel<string>("text");

const showModal = ref(false);
const url = ref("");

const editorText = computed(() => {
    if (!text.value) return "";
    try {
        return JSON.parse(text.value);
    } catch {
        return text.value;
    }
});

const editor = useEditor({
    content: editorText.value,
    extensions: [
        StarterKit.configure({
            heading: { levels: [2, 3, 4, 5, 6] },
        }),
        Link.configure({ openOnClick: false }),
    ],
    editable: (() => !disabled.value as boolean | undefined)(),
    editorProps: {
        attributes: {
            class: "prose sm:min-h-[calc(100vh-10rem)] min-h-[calc(100vh-20rem)] max-h-[calc(100vh-20rem)] sm:max-h-[calc(100vh-10rem)]  overflow-hide prose-zinc lg:prose-sm max-w-none p-3 ring-1 ring-inset border-0 focus:ring-2 focus:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus:ring-zinc-950",
        },
        handlePaste(view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            let html = clipboardData.getData("text/html");
            if (!html) return false;

            html = html
                .replace(/[\r\n\u2028\u2029]+/g, " ") // Remove all line breaks that get added by text editors like word
                .replace(/<br\s*\/?>/gi, " ");

            html = html.replace(/\u00AD/g, "");
            html = html
                .replace(/>\s+</g, "><") // Remove spaces between tags
                .replace(/<br\s*\/?>/gi, "") // Remove standalone <br>
                .replace(/<p>\s*<\/p>/gi, "") // Remove empty paragraphs
                .replace(/&nbsp;/gi, " ") // Clean non breaking spaces
                // Clean heading tags
                .replace(/<h([1-6])([^>]*)>/gi, (match, level, attrs) => {
                    const newLevel = Math.min(parseInt(level) + 1, 6);
                    return `<h${newLevel}${attrs}>`;
                })
                .replace(/<\/h([1-6])>/gi, (match, level) => {
                    const newLevel = Math.min(parseInt(level) + 1, 6);
                    return `</h${newLevel}>`;
                });
            editor.value?.commands.insertContent(html);
            return true;
        },
    },
    onUpdate: ({ editor }) => {
        const raw = editor.getJSON();
        text.value = JSON.stringify(raw);
    },
});

const hasTextSelected = computed(() => {
    const state = editor.value?.state;
    return state ? !state.selection.empty : false;
});

const hasLinkSelected = computed(() => {
    const attrs = editor.value?.getAttributes("link");
    return !!attrs?.href;
});

function openLinkModal() {
    if (!editor.value) return;
    const attrs = editor?.value.getAttributes("link");
    url.value = attrs?.href || "";
    showModal.value = true;
}

function addLink() {
    if (!url.value || !editor.value) return;

    const chain = editor.value.chain().focus();
    if (hasLinkSelected.value) chain.extendMarkRange("link");
    chain.setLink({ href: url.value }).run();
    showModal.value = false;
}

function removeLink() {
    editor.value?.chain().focus().unsetLink().run();
}

watch(disabled, () => {
    editor.value?.setEditable(!disabled.value);
});

// Focus the link editor modal when it opens
// TODO: This is a workaround and should probably be implemented in the LModal component
const urlInput = ref<InstanceType<typeof LInput> | undefined>(undefined);
watch(showModal, async () => {
    if (showModal.value) {
        await nextTick();
        urlInput.value?.focus();
        return;
    }

    editor.value?.commands.focus();
});
</script>

<template>
    <div :class="$attrs.class" class="-mx-4 flex h-full flex-col px-4">
        <div class="flex items-center gap-2">
            <component v-if="props.icon" :is="props.icon" class="h-6 w-6 text-zinc-600" />
            <FormLabel v-if="props.title" :icon="props.icon">{{ title }}</FormLabel>
        </div>
        <div class="flex flex-wrap gap-4" v-if="!disabled">
            <div class="flex pb-2">
                <button
                    :class="[
                        'rounded-l-md bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('bold') },
                    ]"
                    @click="editor?.chain().focus().toggleBold().run()"
                    title="Bold"
                    type="button"
                >
                    <BoldIcon class="h-5 w-5" />
                </button>
                <button
                    :class="[
                        'bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('italic') },
                    ]"
                    @click="editor?.chain().focus().toggleItalic().run()"
                    title="Italic"
                    type="button"
                >
                    <ItalicIcon class="h-5 w-5" />
                </button>
                <button
                    :class="[
                        'rounded-r-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('strike') },
                    ]"
                    @click="editor?.chain().focus().toggleStrike().run()"
                    title="Strikethrough"
                    type="button"
                >
                    <StrikethroughIcon class="h-5 w-5" />
                </button>
            </div>

            <div class="flex pb-2">
                <button
                    :class="[
                        'rounded-l-md bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('heading', { level: 2 }) },
                    ]"
                    @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
                    title="Heading 2"
                    type="button"
                >
                    H2
                </button>
                <button
                    :class="[
                        'bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('heading', { level: 3 }) },
                    ]"
                    @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
                    title="Heading 3"
                    type="button"
                >
                    H3
                </button>
                <button
                    :class="[
                        'bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('heading', { level: 4 }) },
                    ]"
                    @click="editor?.chain().focus().toggleHeading({ level: 4 }).run()"
                    title="Heading 4"
                    type="button"
                >
                    H4
                </button>
                <button
                    :class="[
                        'rounded-r-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('heading', { level: 5 }) },
                    ]"
                    @click="editor?.chain().focus().toggleHeading({ level: 5 }).run()"
                    title="Heading 5"
                    type="button"
                >
                    H5
                </button>
            </div>

            <div class="flex pb-2">
                <button
                    :class="[
                        'rounded-l-md bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('bulletList') },
                    ]"
                    @click="editor?.chain().focus().toggleBulletList().run()"
                    title="Bullet list"
                    type="button"
                >
                    <BulletlistIcon class="h-5 w-5" />
                </button>
                <button
                    :class="[
                        'rounded-r-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('orderedList') },
                    ]"
                    @click="editor?.chain().focus().toggleOrderedList().run()"
                    title="Numbered list"
                    type="button"
                >
                    <NumberedListIcon class="h-5 w-5" />
                </button>
            </div>
            <div class="flex pb-2">
                <button
                    :class="[
                        'rounded-l-md bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('link') },
                    ]"
                    @click="openLinkModal"
                    :disabled="!hasTextSelected"
                    title="Add/Edit Link"
                    type="button"
                >
                    <LinkIcon class="h-5 w-5" />
                </button>
                <button
                    class="rounded-r-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300"
                    @click="removeLink"
                    :disabled="!hasLinkSelected"
                    title="Remove Link"
                    type="button"
                >
                    <LinkSlashIcon class="h-5 w-5" />
                </button>
            </div>
        </div>
        <div class="flex flex-1 flex-col">
            <EditorContent :editor="editor" class="mb-1 flex-1 bg-white" />
        </div>
    </div>
    <LModal
        v-model:isVisible="showModal"
        heading="Add Link"
        @keydown.esc="showModal = false"
        @keydown.enter="addLink"
    >
        <LInput
            ref="urlInput"
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

<style>
.tiptap[contenteditable="false"] {
    @apply bg-zinc-100 opacity-80 hover:ring-zinc-300;
}

/* Ensure the editor fills the container height */
.ProseMirror-focused {
    outline: none;
}

/* Force height inheritance through the TipTap component tree */
div[data-tiptap-editor] {
    height: 100%;
    display: flex;
    flex-direction: column;
}

div[data-tiptap-editor] > div {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.ProseMirror {
    height: 100%;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    flex: 1;
    overflow-y: auto;
}
</style>
