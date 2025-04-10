<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/vue/20/solid";
import LButton from "../button/LButton.vue";

type PaginatorProps = {
    disabled?: boolean;
    size?: number;
    btnVariant?: "secondary" | "primary" | "tertiary" | "muted" | undefined;
    variant?: "simple" | "extended";
};

const index = defineModel<number>("index", {
    required: true,
});

const props = withDefaults(defineProps<PaginatorProps>(), {
    disabled: false,
    size: 0,
    btnVariant: "secondary",
    variant: "simple",
});

const indexes = Array.from({ length: props.size }, (_, i) => i + 1);
console.info("Pagination Component indexes:", indexes);
</script>

<template>
    <div class="flex items-center gap-1">
        <LButton
            :disabled="disabled"
            :variant="btnVariant"
            :icon="ArrowLeftIcon"
            @click="if (index > 0) index -= 1;"
        />
        <span v-if="variant == 'simple'" class="text-sm text-zinc-600"
            >Page <strong>{{ index }}</strong> of <strong>{{ size }}</strong></span
        >
        <span
            v-else-if="variant == 'extended'"
            v-for="i in indexes"
            :key="`index-${i}`"
            :class="i == index ? 'font-bold text-yellow-500' : ''"
        >
            {{ i }}
        </span>
        <LButton
            :disabled="disabled"
            :variant="btnVariant"
            :icon="ArrowRightIcon"
            @click="if (index < size) index += 1;"
        />
    </div>
</template>
