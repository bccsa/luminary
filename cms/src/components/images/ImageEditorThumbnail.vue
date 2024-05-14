<script setup lang="ts">
import { TrashIcon } from "@heroicons/vue/24/solid";
import { ref } from "vue";
import LModal from "@/components/common/LModal.vue";

type Props = {
    filename: string;
    fileWidth?: number;
    fileHeight?: number;
};
const props = defineProps<Props>();

const emit = defineEmits<{
    (e: "delete", filename: string): void;
}>();

const hover = ref(false);
const open = ref(false);

const deleteFile = () => {
    emit("delete", props.filename);
    open.value = false;
};

const cancelDelete = () => {
    open.value = false;
};

const deleteMessage = `Are you sure you want to delete the ${props.fileWidth} x ${props.fileHeight} file version?`;
</script>

<template>
    <div>
        <div class="relative" @mouseover="hover = true" @mouseleave="hover = false">
            <label class="text-xs text-zinc-900">{{ fileWidth }} x {{ fileHeight }}</label>
            <img :src="filename" class="max-h-36 rounded shadow" />
            <TrashIcon
                class="absolute -right-2 top-2 h-5 w-5 cursor-pointer text-red-500"
                v-show="hover"
                title="Delete file version"
                @click="open = true"
            />
        </div>
    </div>
    <LModal
        v-model:open="open"
        title="Delete file version"
        :description="deleteMessage"
        :primaryAction="deleteFile"
        primaryButtonText="Delete"
        :secondaryAction="cancelDelete"
        secondaryButtonText="Cancel"
        context="danger"
    />
</template>
