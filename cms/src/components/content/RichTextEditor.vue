<script setup lang="ts">
import Quill from "quill";
import { onBeforeUnmount, onMounted, ref, watchEffect } from "vue";

type Props = {
    modelValue?: string;
    disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const emit = defineEmits(["update:modelValue"]);

const editorWrapper = ref<HTMLDivElement>();
const editor = ref<HTMLDivElement>();

let quill: Quill | undefined = undefined;

const emitContents = () => {
    emit("update:modelValue", quill!.getSemanticHTML());
};

onMounted(() => {
    const options = {
        modules: {
            toolbar: true,
        },
        placeholder: "Write something...",
        theme: "snow",
        bounds: editorWrapper.value, // This lets tooltips overlap slightly outside the editor container
    };

    quill = new Quill(editor.value!, options);

    if (props.modelValue) {
        quill.clipboard.dangerouslyPasteHTML(props.modelValue);
    }

    if (props.disabled) {
        quill.disable();
    }

    quill.on("text-change", emitContents);
});

onBeforeUnmount(() => {
    quill?.off("text-change", emitContents);
});
</script>

<template>
    <div class="-mx-4 px-4" ref="editorWrapper">
        <div ref="editor"></div>
    </div>
</template>

<style>
/* Quill editor customisations */
.ql-snow .ql-editor {
    @apply font-sans;
}
.ql-toolbar.ql-snow {
    @apply rounded-t-md border-zinc-300;
}
.ql-container.ql-snow {
    @apply rounded-b-md border-zinc-300 shadow-sm;
}
.ql-snow .ql-tooltip {
    @apply rounded-md border-zinc-200 shadow;
}
.ql-snow .ql-picker-label {
    @apply rounded-t-md font-sans;
}
.ql-snow .ql-picker-options {
    @apply rounded-b-md rounded-tr-md font-sans;
}

.ql-snow.ql-disabled {
    @apply bg-zinc-100 text-zinc-500;
}
</style>
