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

const isMobileScreen = computed(() => {
    return window.innerWidth < 640;
});

const pageCount = computed(() => {
    if (!props.amountOfDocs) return 0;
    return Math.ceil(props.amountOfDocs / pageSize.value);
});

const paginatorPages = computed(() => {
    if (!props.amountOfDocs) return [];

    const current = index.value;
    const maxVisible = isMobileScreen.value ? 4 : 5;

    // If total pages are fewer than maxVisible, show all
    if (pageCount.value <= maxVisible) {
        return Array.from({ length: pageCount.value }, (_, i) => i);
    }

    let start = current - Math.floor(maxVisible / 2);
    let end = start + maxVisible;

    if (start < 0) {
        start = 0;
        end = maxVisible;
    }

    // Clamp to end
    if (end > pageCount.value) {
        end = pageCount.value;
        start = pageCount.value - maxVisible;
    }

    return Array.from({ length: end - start }, (_, i) => start + i);
});

const indexUp = () => {
    if (props.amountOfDocs == undefined) return;
    const maxIndex = Math.ceil(props.amountOfDocs / pageSize.value) - 1;
    if (index.value < maxIndex) index.value += 1;
};
</script>

<template>
    <div class="relative flex w-full items-center justify-between">
        <div class="absolute flex items-center gap-1 sm:left-1/2 sm:-translate-x-1/2">
            <!-- Move to first page -->
            <LButton
                class="h-10 w-10 sm:h-10 sm:w-16"
                :disabled="index <= 0"
                :variant="btnVariant"
                :icon="ChevronDoubleLeftIcon"
                @click="index = 0"
                @keydown.left="index = 0"
            />
            <!-- Index down by 1 -->
            <LButton
                class="h-10 w-10 sm:h-10 sm:w-12"
                :disabled="index <= 0"
                :variant="btnVariant"
                :icon="ChevronLeftIcon"
                @click="index > 0 ? (index -= 1) : undefined"
                @keydown.left="index > 0 ? (index -= 1) : undefined"
            />
            <!-- Simple Variant -->
            <span v-if="variant == 'simple'" class="text-sm text-zinc-600">
                Page <strong>{{ index + 1 }}</strong> of
                <strong>{{ paginatorPages.length + 1 }}</strong>
            </span>
            <!-- Extended Variant -->
            <LButton
                v-else-if="variant == 'extended'"
                v-for="i in paginatorPages"
                :key="`index-${i}`"
                class="h-10 w-10 text-zinc-900"
                :class="
                    i === index
                        ? 'bg-zinc-900 font-bold !text-zinc-50 !ring-zinc-900 hover:bg-zinc-900/80'
                        : ''
                "
                @click="index = i"
            >
                <!-- Increase i by 1 so that for the user it starts at 1 -->
                {{ i + 1 }}
            </LButton>
            <!-- Index up by 1 -->
            <LButton
                class="h-10 w-10 sm:h-10 sm:w-12"
                :disabled="index >= pageCount - 1"
                :variant="btnVariant"
                :icon="ChevronRightIcon"
                @click="indexUp"
                @keydown.right="indexUp"
            />
            <!-- Move to last page -->
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
        <!-- This div is a divider to get the LSelect to appear on the right -->
        <div></div>
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
</template>
