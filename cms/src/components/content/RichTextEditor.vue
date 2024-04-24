<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { onBeforeMount, onMounted } from "vue";

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
            class: "prose prose-zinc max-w-none p-3 ring-1 ring-inset border-0 focus:ring-2 focus:ring-inset focus:outline-none rounded-md ring-zinc-300 hover:ring-zinc-400 focus:ring-zinc-950",
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
        <EditorContent :editor="editor" />
    </div>
</template>

<style>
.tiptap[contenteditable="false"] {
    @apply bg-zinc-100 opacity-80 hover:ring-zinc-300;
}
</style>
