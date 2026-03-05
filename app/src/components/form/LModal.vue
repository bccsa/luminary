<script setup lang="ts">
import BaseModal from "@/components/form/BaseModal.vue";

type Props = {
    heading: string;
    withBackground?: boolean;
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
            class="max-h-screen w-full max-w-md rounded-lg"
            :class="[
                props.withBackground !== false
                    ? 'bg-white/90 p-5 shadow-xl dark:bg-slate-700/85'
                    : '',
            ]"
            @click.stop
        >
            <h2 class="mb-4 text-lg font-semibold">{{ heading }}</h2>
            <div class="divide-y divide-zinc-200 dark:divide-slate-600">
                <slot></slot>
            </div>
            <div class="mt-4">
                <slot name="footer"></slot>
            </div>
        </div>
    </BaseModal>
</template>
