<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { onMounted } from "vue";
import BoldIcon from "./icons/BoldIcon.vue";
import ItalicIcon from "./icons/ItalicIcon.vue";
import StrikethroughIcon from "./icons/StrikethroughIcon.vue";
import UnorderedListIcon from "./icons/UnorderedListIcon.vue";
import NumberedListIcon from "./icons/NumberedListIcon.vue";

type Props = {
    modelValue: string;
    disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const emit = defineEmits(["update:modelValue"]);

const editor = useEditor({
    content: props.modelValue,
    extensions: [
        StarterKit.configure({
            heading: {
                levels: [2, 3, 4, 5, 6],
            },
        }),
    ],
    onUpdate: () => emit("update:modelValue", JSON.stringify(editor.value?.getJSON())),
    editable: !props.disabled,
    editorProps: {
        attributes: {
            class: "prose prose-zinc lg:prose-sm max-w-none p-3 ring-1 ring-inset border-0 focus:ring-2 focus:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus:ring-zinc-950",
        },
    },
});

onMounted(() => {
    try {
        const parsedText = JSON.parse(props.modelValue);
        editor.value?.commands.setContent(parsedText, false);
    } catch {
        // Ignore. Probably the text is already HTML
    }
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
                    type="button"
                >
                    <StrikethroughIcon class="h-5 w-5" />
                </button>
            </div>
            <div class="flex pb-2">
                <button
                    :class="[
                        'rounded-l-md bg-zinc-100 px-2 py-1.5 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('bulletList') },
                    ]"
                    @click="editor?.chain().focus().toggleBulletList().run()"
                    type="button"
                >
                    <UnorderedListIcon class="h-5 w-5" />
                </button>

                <button
                    :class="[
                        'rounded-r-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 active:bg-zinc-300',
                        { 'bg-zinc-300': editor?.isActive('orderedList') },
                    ]"
                    @click="editor?.chain().focus().toggleOrderedList().run()"
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
