<script setup lang="ts">
import Quill from "quill";
import { onMounted, ref } from "vue";

type Props = {
    modelValue?: string;
};

const props = defineProps<Props>();
const editorWrapper = ref<HTMLDivElement>();
const editor = ref<HTMLDivElement>();

const emit = defineEmits(["update:modelValue"]);

onMounted(() => {
    const options = {
        modules: {
            toolbar: true,
        },
        placeholder: "Write something...",
        theme: "snow",
        bounds: editorWrapper.value, // This lets tooltips overlap slightly outside the editor container
    };

    const quill = new Quill(editor.value!, options);

    if (props.modelValue) {
        quill.setContents(JSON.parse(props.modelValue));
    }

    quill.on("text-change", () => {
        emit("update:modelValue", JSON.stringify(quill.getContents()));
    });
});
</script>

<template>
    <div class="-mx-4 px-4" ref="editorWrapper">
        <div ref="editor"></div>
    </div>
</template>
