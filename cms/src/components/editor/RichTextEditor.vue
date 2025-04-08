<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { computed, toRefs, watch } from "vue";
import BoldIcon from "./icons/BoldIcon.vue";
import ItalicIcon from "./icons/ItalicIcon.vue";
import StrikethroughIcon from "./icons/StrikethroughIcon.vue";
import BulletlistIcon from "./icons/BulletListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";
import Link from "@tiptap/extension-link";

type Props = {
    disabled: boolean;
};
const props = defineProps<Props>();
const { disabled } = toRefs(props);
const text = defineModel<string>("text");

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
            class: "prose prose-zinc lg:prose-sm max-w-none p-3 ring-1 ring-inset border-0 focus:ring-2 focus:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus:ring-zinc-950",
        },
        handlePaste(view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            const html = clipboardData.getData("text/html");
            if (html) {
                let cleanedHtml = html;
                if (html.match(/<h([1])([^>]*)>/gi)) {
                    cleanedHtml = html
                        .replace(/<h([1-5])([^>]*)>/gi, (match, level, attrs) => {
                            const newLevel = parseInt(level) + 1;
                            return `<h${newLevel}${attrs}>`;
                        })
                        .replace(/<\/h([1-5])>/gi, (match, level) => {
                            const newLevel = parseInt(level) + 1;
                            return `</h${newLevel}>`;
                        });
                }

                cleanedHtml = cleanedHtml
                    .replace(/\r\n/gi, "")
                    .replace(/<span[^>]*>/gi, "") // strip <span> tags
                    .replace(/<\/span>/gi, "")
                    .replace(/<o:p>\s*<\/o:p>/g, "") // empty <o:p> from Word
                    .replace(/<o:p>.*?<\/o:p>/g, "&nbsp;") // non-empty <o:p>
                    .replace(/\u00A0/g, " ") // non-breaking spaces to normal spaces
                    .replace(/&nbsp;/g, " ") // HTML non-breaking spaces
                    .replace(/\s+/g, " ") // remove multiple consecutive spaces
                    .replace(/\r\n|\n|\r/g, ""); // strip newline characters;

                editor.value?.commands.insertContent(cleanedHtml);
                return true;
            }

            return false;
        },
    },
    onUpdate: ({ editor }) => {
        const raw = editor.getJSON();
        // const cleaned = removeEmptyLineBreaks(raw);
        text.value = JSON.stringify(raw);
    },
});

watch(disabled, () => {
    editor.value?.setEditable(!disabled.value);
});
</script>

<template>
    <div class="-mx-4 px-4">
        <div class="flex gap-4" v-if="!disabled">
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
        </div>
        <EditorContent :editor="editor" />
    </div>
</template>

<style>
.tiptap[contenteditable="false"] {
    @apply bg-zinc-100 opacity-80 hover:ring-zinc-300;
}
</style>
