<script setup lang="ts">
import {
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import { computed, ref, watch } from "vue";
import LSelect from "../forms/LSelect.vue";
import { isSmallScreen } from "@/globalConfig";

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

const pageCount = computed(() => {
    if (!props.amountOfDocs) return 0;
    return Math.ceil(props.amountOfDocs / pageSize.value);
});

const paginatorPages = computed(() => {
    if (!props.amountOfDocs) return [];

    const current = index.value;
    const maxVisible = isSmallScreen.value ? 3 : 5;

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

const openPageSizeSelect = ref(false);
// Timeout to close the page size select after 6
const isPageSizeSelectFocused = ref(false);
let closeTimeout: ReturnType<typeof setTimeout> | null = null;

const openPageSizeSelectHandler = () => {
    if (!isSmallScreen.value) return;
    openPageSizeSelect.value = true;
};

// Timer to close the page size select after 3 seconds of inactivity and select is not currently focused
const timer = () => {
    const activateTimer = () => {
        if (closeTimeout) clearTimeout(closeTimeout);
        closeTimeout = setTimeout(() => {
            if (!isPageSizeSelectFocused.value) {
                openPageSizeSelect.value = false;
            }
        }, 3000);
    };

    const exitTimer = () => {
        isPageSizeSelectFocused.value = false;
        closeTimeout = setTimeout(() => {
            if (!isPageSizeSelectFocused.value) {
                openPageSizeSelect.value = false;
            }
        }, 3000);
    };

    return {
        activateTimer,
        exitTimer,
    };
};

watch(openPageSizeSelect, (newValue) => {
    if (!newValue) return;

    timer().activateTimer();
});
</script>

<template>
    <div
        class="relative flex h-10 w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
        <div class="flex w-full sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:justify-center">
            <div class="flex w-full flex-wrap items-center justify-center gap-1">
                <LButton
                    class="h-10 w-10 sm:h-10 sm:w-16"
                    :disabled="index <= 0"
                    :variant="btnVariant"
                    :icon="ChevronDoubleLeftIcon"
                    @click="
                        index = 0;
                        openPageSizeSelectHandler();
                    "
                    @keydown.left="index = 0"
                />
                <LButton
                    class="h-10 w-10 sm:h-10 sm:w-12"
                    :disabled="index <= 0"
                    :variant="btnVariant"
                    :icon="ChevronLeftIcon"
                    @click="
                        () => {
                            index > 0 ? (index -= 1) : undefined;
                            openPageSizeSelectHandler();
                        }
                    "
                    @keydown.left="
                        () => {
                            index > 0 ? (index -= 1) : undefined;
                            openPageSizeSelectHandler();
                        }
                    "
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
                    @click="
                        () => {
                            index = i;
                            openPageSizeSelectHandler();
                        }
                    "
                >
                    {{ i + 1 }}
                </LButton>
                <LButton
                    class="h-10 w-10 sm:h-10 sm:w-12"
                    :disabled="index >= pageCount - 1"
                    :variant="btnVariant"
                    :icon="ChevronRightIcon"
                    @click="
                        () => {
                            indexUp();
                            openPageSizeSelectHandler();
                        }
                    "
                    @keydown.right="
                        () => {
                            indexUp();
                            openPageSizeSelectHandler();
                        }
                    "
                />
                <LButton
                    v-if="!(props.amountOfDocs !== undefined && props.amountOfDocs < pageSize)"
                    class="h-10 w-10 sm:h-10 sm:w-16"
                    :disabled="index >= pageCount - 1"
                    :variant="btnVariant"
                    :icon="ChevronDoubleRightIcon"
                    @click="
                        () => {
                            index = pageCount - 1;
                            openPageSizeSelectHandler();
                        }
                    "
                    @keydown.right="indexUp"
                />
            </div>
            <div
                v-if="openPageSizeSelect"
                class="absolute -left-6 bottom-12 z-10 flex h-10 w-screen items-center justify-center border-t border-t-zinc-300 bg-white py-6"
            >
                <LSelect
                    @click="openPageSizeSelect = true"
                    v-model="pageSize"
                    :options="[
                        { value: 5, label: '5' },
                        { value: 10, label: '10' },
                        { value: 20, label: '20' },
                        { value: 50, label: '50' },
                    ]"
                    @focus="
                        () => {
                            timer().activateTimer();
                            isPageSizeSelectFocused = true;
                        }
                    "
                    @blur="timer().exitTimer()"
                />
            </div>
        </div>

        <div v-if="!isSmallScreen" class="flex w-full justify-center sm:justify-end">
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
