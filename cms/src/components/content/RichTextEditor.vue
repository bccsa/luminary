<script setup lang="ts">
import Quill from "quill";
import { onBeforeUnmount, onMounted, ref } from "vue";

type Props = {
    modelValue?: string;
};

const props = defineProps<Props>();

const emit = defineEmits(["update:modelValue"]);

const editorWrapper = ref<HTMLDivElement>();
const editor = ref<HTMLDivElement>();

let quill: Quill | undefined = undefined;

const emitContents = () => {
    emit("update:modelValue", JSON.stringify(quill!.getContents()));
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
        quill.setContents(JSON.parse(props.modelValue));
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
