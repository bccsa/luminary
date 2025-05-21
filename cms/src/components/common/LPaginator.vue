<script setup lang="ts">
import {
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import { computed } from "vue";
import LSelect from "../forms/LSelect.vue";

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
    disabled: false,
    size: 0,
    btnVariant: "secondary",
    variant: "simple",
});

const pageSize = defineModel<number>("pageSize", {
    required: true,
});

const isMobileScreen = computed(() => window.innerWidth < 640);

const pageCount = computed(() => {
    if (!props.amountOfDocs) return 0;
    return Math.ceil(props.amountOfDocs / pageSize.value);
});

const paginatorPages = computed(() => {
    if (!props.amountOfDocs) return [];

    const current = index.value;
    const maxVisible = isMobileScreen.value ? 4 : 5;

    if (pageCount.value <= maxVisible) {
        return Array.from({ length: pageCount.value }, (_, i) => i);
    }

    let start = current - Math.floor(maxVisible / 2);
    let end = start + maxVisible;

    if (start < 0) {
        start = 0;
        end = maxVisible;
    }

    if (end > pageCount.value) {
        end = pageCount.value;
        start = pageCount.value - maxVisible;
    }

    return Array.from({ length: end - start }, (_, i) => start + i);
});

const indexUp = () => {
    if (props.amountOfDocs == undefined) return;
    const maxIndex = pageCount.value - 1;
    if (index.value < maxIndex) index.value += 1;
};
</script>

<template>
    <div class="relative flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex w-full sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:justify-center">
            <div class="flex w-full flex-wrap items-center justify-center gap-1">
                <LButton
                    class="h-10 w-10 sm:h-10 sm:w-16"
                    :disabled="index <= 0"
                    :variant="btnVariant"
                    :icon="ChevronDoubleLeftIcon"
                    @click="index = 0"
                    @keydown.left="index = 0"
                />
                <LButton
                    class="h-10 w-10 sm:h-10 sm:w-12"
                    :disabled="index <= 0"
                    :variant="btnVariant"
                    :icon="ChevronLeftIcon"
                    @click="index > 0 ? (index -= 1) : undefined"
                    @keydown.left="index > 0 ? (index -= 1) : undefined"
                />
                <span v-if="variant === 'simple'" class="text-sm text-zinc-600">
                    Page <strong>{{ index + 1 }}</strong> of
                    <strong>{{ paginatorPages.length + 1 }}</strong>
                </span>
                <LButton
                    v-else-if="variant === 'extended'"
                    v-for="i in paginatorPages"
                    :key="`index-${i}`"
                    class="h-10 w-10 text-zinc-900"
                    :class="{
                        'bg-zinc-900 font-bold !text-zinc-50 !ring-zinc-900 hover:bg-zinc-900/80':
                            i === index,
                    }"
                    @click="index = i"
                >
                    {{ i + 1 }}
                </LButton>
                <LButton
                    class="h-10 w-10 sm:h-10 sm:w-12"
                    :disabled="index >= pageCount - 1"
                    :variant="btnVariant"
                    :icon="ChevronRightIcon"
                    @click="indexUp"
                    @keydown.right="indexUp"
                />
                <LButton
                    v-if="!(props.amountOfDocs !== undefined && props.amountOfDocs < pageSize)"
                    class="h-10 w-10 sm:h-10 sm:w-16"
                    :disabled="index >= pageCount - 1"
                    :variant="btnVariant"
                    :icon="ChevronDoubleRightIcon"
                    @click="index = pageCount - 1"
                    @keydown.right="indexUp"
                />
            </div>
        </div>

        <div class="flex w-full justify-center sm:justify-end">
            <LSelect
                v-model="pageSize"
                :options="[
                    { value: 5, label: '5' },
                    { value: 10, label: '10' },
                    { value: 20, label: '20' },
                    { value: 50, label: '50' },
                ]"
            />
        </div>
    </div>
</template>
