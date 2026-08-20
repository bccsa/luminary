<script setup lang="ts">
import { computed, ref } from "vue";

type Props = {
    label: string;
    modelValue?: string;
    length?: number;
    error?: boolean;
    disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), { length: 6, error: false, disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: string]; complete: [value: string] }>();

const boxes = ref<HTMLInputElement[]>([]);
const digits = computed(() =>
    Array.from({ length: props.length }, (_, i) => props.modelValue?.[i] ?? ""),
);

function write(next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, props.length);
    emit("update:modelValue", cleaned);
    if (cleaned.length === props.length) emit("complete", cleaned);
    return cleaned;
}

function onInput(index: number, event: Event) {
    const target = event.target as HTMLInputElement;
    const typed = target.value.replace(/\D/g, "");
    target.value = "";
    if (!typed) return;

    const current = props.modelValue ?? "";
    const next = write(current.slice(0, index) + typed + current.slice(index + typed.length));
    boxes.value[Math.min(next.length, props.length - 1)]?.focus();
}

function onKeydown(index: number, event: KeyboardEvent) {
    if (event.key !== "Backspace") return;
    event.preventDefault();
    const current = props.modelValue ?? "";
    // Backspace on an empty box clears the one before it, which is where the caret looks to be.
    const target = current[index] ? index : index - 1;
    if (target < 0) return;
    write(current.slice(0, target) + current.slice(target + 1));
    boxes.value[target]?.focus();
}

function onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const next = write(event.clipboardData?.getData("text") ?? "");
    boxes.value[Math.min(next.length, props.length - 1)]?.focus();
}
</script>

<template>
    <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-zinc-700 dark:text-slate-200">{{ label }}</span>
        <div
            class="flex gap-2"
            role="group"
            :aria-label="label"
        >
            <input
                v-for="(digit, index) in digits"
                :key="index"
                :ref="(el) => (boxes[index] = el as HTMLInputElement)"
                :value="digit"
                :disabled="disabled"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="1"
                class="h-14 w-full min-w-0 rounded-md border bg-white text-center text-xl font-semibold tabular-nums text-zinc-900 shadow-sm focus:outline-none focus:ring-2 disabled:bg-zinc-100 dark:bg-slate-700 dark:text-slate-100 dark:disabled:bg-slate-800"
                :class="
                    error
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/40 dark:border-red-500/70'
                        : 'border-zinc-300 focus:border-yellow-500 focus:ring-yellow-500/40 dark:border-slate-600'
                "
                @input="onInput(index, $event)"
                @keydown="onKeydown(index, $event)"
                @paste="onPaste"
            />
        </div>
    </div>
</template>
