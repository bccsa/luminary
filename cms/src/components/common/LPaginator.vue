<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/vue/20/solid";
import LButton from "../button/LButton.vue";
import { computed } from "vue";
import LSelect from "../forms/LSelect.vue";
import { ListBulletIcon } from "@heroicons/vue/24/outline";

type PaginatorProps = {
    disabled?: boolean;
    amountOfDocs?: number;
    btnVariant?: "secondary" | "primary" | "tertiary" | "muted" | undefined;
    variant?: "simple" | "extended";
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

const pageSize = defineModel<number>("pageSize", {
    required: true,
});

const visiblePages = computed(() => {
    if (!props.amountOfDocs) return [];
    const amountOfPages = Math.ceil(props.amountOfDocs / pageSize.value);
    const current = index;
    const maxVisible = amountOfPages;

    const half = Math.floor(maxVisible / 2);
    let start = current.value - half;
    let end = current.value + half;

    if (start < 0) {
        start = 0;
        end = Math.min(maxVisible, amountOfPages);
    } else if (end > amountOfPages) {
        end = amountOfPages;
        start = Math.max(1, end - maxVisible + 1);
    }

    const range: number[] = [];
    for (let i = start; i <= end - 1; i++) {
        range.push(i);
    }
    return range;
});

const indexDown = () => {
    if (index.value > 0) index.value -= 1;
};

const indexUp = () => {
    if (props.amountOfDocs == undefined) return;
    const maxIndex = Math.ceil(props.amountOfDocs / pageSize.value) - 1;
    if (index.value < maxIndex) index.value += 1;
};
</script>

<template>
    <div class="relative flex w-full items-center justify-between">
        <div class="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
            <LButton
                class="h-10 w-16"
                :disabled="
                    disabled || (props.amountOfDocs !== undefined && props.amountOfDocs < pageSize)
                "
                :variant="btnVariant"
                :icon="ArrowLeftIcon"
                @click="indexDown"
                @keydown.left="indexDown"
            />
            <span v-if="variant == 'simple'" class="text-sm text-zinc-600">
                Page <strong>{{ index + 1 }}</strong> of <strong>{{ amountOfDocs }}</strong>
            </span>
            <LButton
                v-else-if="variant == 'extended'"
                v-for="i in visiblePages"
                :key="`index-${i}`"
                class="h-10 w-10 text-zinc-900"
                :class="
                    i === index
                        ? 'bg-zinc-900 font-bold !text-zinc-50 !ring-zinc-900 hover:bg-zinc-900/80'
                        : ''
                "
                @click="index = i"
            >
                {{ i + 1 }}
            </LButton>
            <LButton
                class="h-10 w-16"
                :disabled="
                    disabled || (props.amountOfDocs !== undefined && props.amountOfDocs < pageSize)
                "
                :variant="btnVariant"
                :icon="ArrowRightIcon"
                @click="indexUp"
                @keydown.right="indexUp"
            />
        </div>
        <div></div>
        <LSelect
            :icon="ListBulletIcon"
            class="w-15"
            v-model="pageSize"
            :options="[
                { value: 5, label: '5' },
                { value: 10, label: '10' },
                { value: 20, label: '20' },
                { value: 30, label: '30' },
            ]"
        />
    </div>
</template>
