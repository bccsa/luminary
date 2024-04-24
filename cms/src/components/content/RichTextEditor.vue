<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";

type Props = {
    modelValue?: string;
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
    onUpdate: () => emit("update:modelValue", editor.value?.getHTML()),
    editable: !props.disabled,
    editorProps: {
        attributes: {
            class: "prose prose-zinc",
        },
    },
});
</script>

<template>
    <div class="-mx-4 px-4">
        <EditorContent :editor="editor" />
    </div>
</template>
