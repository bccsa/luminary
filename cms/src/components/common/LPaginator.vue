<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/vue/20/solid";
import LButton from "../button/LButton.vue";

type PaginatorProps = {
    disabled?: boolean;
    size?: number;
    variant?: "secondary" | "primary" | "tertiary" | "muted" | undefined;
};

const index = defineModel<number>("index", {
    required: true,
});

withDefaults(defineProps<PaginatorProps>(), {
    disabled: false,
    size: 0,
    variant: "secondary",
});
</script>

<template>
    <div class="flex items-center gap-1">
        <LButton
            :disabled="disabled"
            :variant="variant"
            :icon="ArrowLeftIcon"
            @click="if (index > 0) index -= 1;"
        />
        <span class="text-sm text-zinc-600"
            >Page <strong>{{ index }}</strong> of <strong>{{ size }}</strong></span
        >
        <LButton
            :disabled="disabled"
            :variant="variant"
            :icon="ArrowRightIcon"
            @click="if (index < size) index += 1;"
        />
    </div>
</template>
