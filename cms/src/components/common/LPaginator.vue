<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/vue/20/solid";
import LButton from "../button/LButton.vue";
import { computed } from "vue";

type PaginatorProps = {
    disabled?: boolean;
    size?: number;
    btnVariant?: "secondary" | "primary" | "tertiary" | "muted" | undefined;
    variant?: "simple" | "extended";
    indexPage?: number;
};

const index = defineModel<number>("index", {
    required: true,
});

const props = withDefaults(defineProps<PaginatorProps>(), {
    indexPage: 5,
    disabled: false,
    size: 0,
    btnVariant: "secondary",
    variant: "simple",
});

const visiblePages = computed(() => {
    const total = props.size;
    const current = index;
    const maxVisible = props.indexPage;

    const half = Math.floor(maxVisible / 2);
    let start = current.value - half;
    let end = current.value + half;

    if (start < 0) {
        start = 0;
        end = Math.min(maxVisible, total);
    } else if (end > total) {
        end = total;
        start = Math.max(1, end - maxVisible + 1);
    }

    const range: number[] = [];
    for (let i = start; i <= end; i++) {
        range.push(i);
    }
    return range;
});

const indexDown = () => {
    if (index.value > 0) index.value -= 1;
};

const indexUp = () => {
    if (index.value < props.size) index.value += 1;
};
</script>

<template>
    <div class="flex items-center gap-1">
        <LButton
            class="h-10 w-16"
            :disabled="disabled"
            :variant="btnVariant"
            :icon="ArrowLeftIcon"
            @click="indexDown"
            @keydown.left="indexDown"
        />
        <span v-if="variant == 'simple'" class="text-sm text-zinc-600"
            >Page <strong>{{ index }}</strong> of <strong>{{ size }}</strong></span
        >
        <LButton
            v-else-if="variant == 'extended'"
            v-for="i in visiblePages"
            :key="`index-${i}`"
            class="h-10 w-10"
            :class="i == index ? ' bg-zinc-900 font-bold text-zinc-50 hover:bg-zinc-900/80' : ''"
            @click="index = i"
        >
            {{ i }}
        </LButton>
        <LButton
            class="h-10 w-16"
            :disabled="disabled"
            :variant="btnVariant"
            :icon="ArrowRightIcon"
            @click="indexUp"
            @keydown.right="indexUp"
        />
    </div>
</template>
