<script setup lang="ts">
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";

type Props = {
    title?: string;
    open?: boolean;
};

withDefaults(defineProps<Props>(), {
    open: false,
    context: "default",
});

const emit = defineEmits(["update:open"]);

const close = () => {
    emit("update:open", false);
};
</script>

<template>
    <TransitionRoot as="template" :show="open">
        <Dialog as="div" class="relative z-40" @close="close">
            <TransitionChild
                as="template"
                enter="ease-out duration-300"
                enter-from="opacity-0"
                enter-to="opacity-100"
                leave="ease-in duration-200"
                leave-from="opacity-100"
                leave-to="opacity-0"
            >
                <div class="fixed inset-0 bg-zinc-500 bg-opacity-75 transition-opacity" />
            </TransitionChild>

            <div class="fixed inset-0 z-10 h-screen w-screen overflow-y-auto p-2 sm:p-8">
                <DialogPanel
                    class="relative h-full w-full transform overflow-y-auto rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all"
                >
                    <DialogTitle
                        v-if="title"
                        as="h3"
                        class="text-base font-semibold leading-6 text-zinc-900"
                    >
                        {{ title }}
                    </DialogTitle>

                    <slot></slot>
                </DialogPanel>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
