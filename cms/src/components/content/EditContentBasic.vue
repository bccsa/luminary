<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LToggle from "@/components/forms/LToggle.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import { PencilIcon, ChevronLeftIcon } from "@heroicons/vue/16/solid";
import { ContentStatus, type ContentDto } from "@/types";
import { nextTick, ref, watch } from "vue";
import { DateTime } from "luxon";
import { Slug } from "@/util/slug";
import { db } from "@/db/baseDatabase";
import { watchDeep } from "@vueuse/core";

type Props = {
    disabled: boolean;
    validated: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Slug generation
const isEditingSlug = ref(false);
const slugInput = ref<HTMLInputElement | undefined>(undefined);
const updateSlug = async (text: string) => {
    if (!content || !content.value) return;

    text = text.trim();
    if (!text) text = content.value.title || "";
    if (!text) return "invalid-slug";

    content.value.slug = await Slug.generate(text, content.value._id || "");
};

let previousTitle: string;
const autoUpdateSlug = async (title: string) => {
    if (!content || !content.value) return;
    if (!previousTitle) previousTitle = content.value.title;

    if (!content.value.slug) await updateSlug(title);

    if (content.value.status == ContentStatus.Draft && !content.value.title) {
        content.value.slug = "";
    }

    // Only auto-update if in draft mode
    // Check if the slug is still the default value
    if (
        content.value.status == ContentStatus.Draft &&
        content.value.slug.replace(/-[0-9]*$/g, "") ==
            Slug.generateNonUnique(previousTitle).replace(/-[0-9]*$/g, "")
    ) {
        await updateSlug(title);
    }

    previousTitle = title;
};

const startEditingSlug = () => {
    isEditingSlug.value = true;
    nextTick(() => {
        slugInput.value?.focus();
    });
};

watch(
    content,
    () => {
        if (!content.value) return;
        autoUpdateSlug(content.value.title);
    },
    { deep: true },
);

// Publish and expiry dates
const publishDateString = ref<string | undefined>(undefined);
watch(content, () => {
    if (!content.value) return;
    if (!content.value.publishDate) {
        publishDateString.value = undefined;
        return;
    }

    const date = db.toIsoDateTime(content.value.publishDate);
    publishDateString.value = date ? date : undefined;
});

const expiryDateString = ref<string | undefined>(undefined);
watchDeep(content, () => {
    if (!content.value) return;
    if (!content.value.expiryDate) {
        expiryDateString.value = undefined;
        return;
    }

    const date = db.toIsoDateTime(content.value.expiryDate);
    expiryDateString.value = date ? date : undefined;
});

const selectedExpiryNumber = ref<number | undefined>(undefined);
const selectedExpiryUnit = ref<string | undefined>(undefined);

const calculateExpiryDate = () => {
    if (
        !content.value ||
        !content.value.publishDate ||
        !selectedExpiryNumber.value ||
        !selectedExpiryUnit.value
    )
        return;

    switch (selectedExpiryUnit.value) {
        case "Week":
            content.value.expiryDate = DateTime.fromMillis(content.value.publishDate)
                .plus({ weeks: selectedExpiryNumber.value })
                .toMillis();
            break;
        case "Month":
            content.value.expiryDate = DateTime.fromMillis(content.value.publishDate)
                .plus({ months: selectedExpiryNumber.value })
                .toMillis();
            break;
        case "Year":
            content.value.expiryDate = DateTime.fromMillis(content.value.publishDate)
                .plus({ years: selectedExpiryNumber.value })
                .toMillis();
            break;
        default:
            console.warn(`Unknown unit: ${selectedExpiryUnit.value}`);
    }
    clearExpirySelection();
};

const setExpiryNumber = (number: number | undefined) => {
    selectedExpiryNumber.value = number;
    calculateExpiryDate();
};

const setExpiryUnit = (unit: string | undefined) => {
    selectedExpiryUnit.value = unit;
    calculateExpiryDate();
};

const clearExpirySelection = () => {
    selectedExpiryNumber.value = undefined;
    selectedExpiryUnit.value = undefined;
};

const clearExpiryDate = () => {
    if (content.value) content.value.expiryDate = undefined;
    clearExpirySelection();
};

// Linked publish and expiry dates
const linkedDates = ref<boolean>(false);

// Publish status
const publishStatus = ref<boolean>(false);
watch(content, () => {
    if (!content.value) return;
    publishStatus.value = content.value.status == ContentStatus.Published;
});
watch(publishStatus, () => {
    if (!content.value) return;
    content.value.status = publishStatus.value ? ContentStatus.Published : ContentStatus.Draft;
});
</script>

<template>
    <LCard title="Basic translation settings" collapsible v-if="content">
        <!-- Title -->
        <LInput name="title" label="Title" required :disabled="disabled" v-model="content.title" />

        <!-- Slug -->
        <div class="mt-2 flex gap-1 align-top text-xs text-zinc-800">
            <span class="py-0.5">Slug:</span>
            <span
                v-show="!isEditingSlug"
                data-test="slugSpan"
                class="inline-block rounded-md bg-zinc-200 px-1.5 py-0.5"
                >{{ content.slug }}</span
            >
            <LInput
                v-show="isEditingSlug"
                ref="slugInput"
                name="slug"
                size="sm"
                class="w-full"
                v-model="content.slug"
                @change="(e) => updateSlug(e.target.value)"
                @blur="isEditingSlug = false"
            />
            <button
                data-test="editSlugButton"
                v-if="!isEditingSlug && !disabled"
                @click="startEditingSlug"
                class="flex h-5 w-5 min-w-5 items-center justify-center rounded-md py-0.5 hover:bg-zinc-200 active:bg-zinc-300"
                title="Edit slug"
            >
                <component :is="PencilIcon" class="h-4 w-4 text-zinc-500" />
            </button>
        </div>

        <!-- Summary -->
        <LInput
            name="summary"
            label="Summary"
            class="mt-4"
            :disabled="disabled"
            v-model="content.summary"
        />

        <!-- Publish settings -->
        <div class="mt-4 flex flex-col gap-4 sm:flex-row">
            <!-- Publish date -->
            <LInput
                name="publishDate"
                label="Publish date"
                class="sm:w-1/2"
                type="datetime-local"
                :disabled="disabled"
                v-model="publishDateString"
                @change="
                    (e) => {
                        if (!content) return;
                        content.publishDate = db.fromIsoDateTime(e.target.value);
                    }
                "
            >
                <!-- Link publish & expiry dates toggle -->
                <div class="flex items-center justify-between">
                    <FormLabel>Link dates (not implemented yet)</FormLabel>
                    <LToggle v-model="linkedDates" :disabled="disabled || true" />
                </div>

                <!-- Publish / draft toggle -->
                <div class="mt-2 flex items-center justify-between">
                    <FormLabel>Status: Draft / Published</FormLabel>
                    <LToggle v-model="publishStatus" :disabled="disabled" />
                </div>
            </LInput>

            <!-- Expiry date -->
            <LInput
                name="expiryDate"
                label="Expiry date"
                class="group sm:w-1/2"
                type="datetime-local"
                :disabled="disabled"
                v-model="expiryDateString"
                @change="
                    (e) => {
                        if (!content) return;
                        content.expiryDate = db.fromIsoDateTime(e.target.value);
                    }
                "
            >
                <!-- Expiry date shortcut buttons -->
                <div class="flex w-full cursor-pointer flex-wrap gap-1">
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{
                            ' bg-black text-white': selectedExpiryNumber === 1,
                        }"
                        @click="setExpiryNumber(1)"
                        data-test="1"
                        :disabled="disabled"
                    >
                        1
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryNumber === 2 }"
                        @click="setExpiryNumber(2)"
                        :disabled="disabled"
                    >
                        2
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryNumber === 3 }"
                        @click="setExpiryNumber(3)"
                        :disabled="disabled"
                    >
                        3
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        size="lg"
                        :class="{ 'bg-black text-white': selectedExpiryNumber === 6 }"
                        @click="setExpiryNumber(6)"
                        :disabled="disabled"
                    >
                        6
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryUnit === 'Week' }"
                        @click="setExpiryUnit('Week')"
                        data-test="W"
                        :disabled="disabled"
                    >
                        W
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryUnit === 'Month' }"
                        @click="setExpiryUnit('Month')"
                        :disabled="disabled"
                    >
                        M
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryUnit === 'Year' }"
                        @click="setExpiryUnit('Year')"
                        :disabled="disabled"
                    >
                        Y
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        :icon="ChevronLeftIcon"
                        class="flex-1"
                        @click="clearExpiryDate()"
                        :disabled="disabled"
                    >
                    </LButton>
                </div>
            </LInput>
        </div>
    </LCard>
</template>
