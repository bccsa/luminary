<script setup lang="ts">
import BaseModal from "@/components/form/BaseModal.vue";
import { XMarkIcon } from "@heroicons/vue/24/outline";

type Props = {
    heading: string;
    withBackground?: boolean;
    closeButton?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    withBackground: true,
    size: "default",
});

const isVisible = defineModel<boolean>("isVisible");
const emit = defineEmits(["close"]);
</script>

<template>
    <BaseModal
        v-model:isVisible="isVisible"
        @close="emit('close')"
    >
        <div
            class="max-h-full w-full max-w-md overflow-y-auto rounded-lg"
            :class="[
                props.closeButton ? 'max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)]' : '',
                props.withBackground !== false
                    ? 'bg-white/90 p-5 shadow-xl dark:bg-slate-700/85'
                    : '',
            ]"
            @click.stop
        >
            <div
                v-if="props.closeButton"
                class="sticky top-0 z-10 -mx-5 -mt-5 mb-4 flex items-center justify-between gap-2 bg-white px-5 py-3 dark:bg-slate-700"
            >
                <h2 class="text-lg font-semibold">{{ heading }}</h2>
                <button
                    type="button"
                    class="shrink-0 rounded-full p-1"
                    aria-label="Close"
                    data-test="modal-close"
                    @click="emit('close')"
                >
                    <XMarkIcon class="h-6 w-6" />
                </button>
            </div>
            <h2 v-else class="mb-4 text-lg font-semibold">{{ heading }}</h2>
            <div class="divide-y divide-zinc-200 dark:divide-slate-600">
                <slot></slot>
            </div>
            <div
                v-if="$slots.footer"
                class="mt-4"
            >
                <slot name="footer"></slot>
            </div>
        </div>
    </BaseModal>
</template>
