<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LToggle from "@/components/forms/LToggle.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import { PencilIcon, ChevronLeftIcon } from "@heroicons/vue/16/solid";
import { PublishStatus, type ContentDto, db } from "luminary-shared";
import { computed, nextTick, ref, watch } from "vue";
import { DateTime } from "luxon";
import { Slug } from "@/util/slug";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Slug generation
const isEditingSlug = ref(false);
const slugInput = ref<HTMLInputElement | undefined>(undefined);

const startEditingSlug = () => {
    isEditingSlug.value = true;
    nextTick(() => {
        slugInput.value?.focus();
    });
};

let previousTitle: string = content.value?.title || "";
let previousSlug: string = content.value?.slug || "";
watch(
    content,
    async () => {
        if (!content.value) return;

        const titleChanged = previousTitle != content.value.title;
        const slugChanged = previousSlug != content.value.slug;

        // Only update the slug if the title or slug has changed
        if (!titleChanged && !slugChanged) {
            return;
        }

        // If the title is empty, generate a new slug
        if (!content.value.title) {
            content.value.slug = "";
        }

        // If the slug is empty, generate a new one from the title
        if (!content.value.slug) {
            content.value.slug = Slug.generateNonUnique(content.value.title);
        }

        // Auto-update the slug if the title changes when in draft mode (unless the slug has been manually changed)
        if (
            titleChanged &&
            content.value.status == PublishStatus.Draft &&
            content.value.slug.replace(/-[0-9]*$/g, "") ==
                Slug.generateNonUnique(previousTitle).replace(/-[0-9]*$/g, "")
        ) {
            // TODO: This sometimes creates a race condition
            content.value.slug = Slug.generateNonUnique(content.value.title);
        }

        // Validate slug
        if (slugChanged) {
            content.value.slug = Slug.generateNonUnique(content.value.slug);
        }

        previousTitle = content.value.title;
        previousSlug = content.value.slug;
    },
    { deep: true },
);

const validateSlug = async () => {
    if (!content.value) return;
    content.value.slug = await Slug.generate(content.value.slug, content.value._id || "");
};

// Publish and expiry dates
const publishDateString = computed({
    get() {
        if (!content.value || !content.value.publishDate) return;
        return db.toIsoDateTime(content.value.publishDate);
    },
    set(val) {
        if (!content.value) return;
        if (!val) {
            content.value.publishDate = undefined;
            return;
        }
        content.value.publishDate = db.fromIsoDateTime(val);
    },
});

const expiryDateString = computed({
    get() {
        if (!content.value || !content.value.expiryDate) return;
        return db.toIsoDateTime(content.value.expiryDate);
    },
    set(val) {
        if (!content.value) return;
        if (!val) {
            content.value.expiryDate = undefined;
            return;
        }
        content.value.expiryDate = db.fromIsoDateTime(val);
    },
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
// const linkedDates = ref<boolean>(false); // future feature

// Publish status
const publishStatus = computed({
    get() {
        if (!content.value) return false;
        return content.value.status == PublishStatus.Published;
    },
    set(val) {
        if (!content.value) return;
        content.value.status = val ? PublishStatus.Published : PublishStatus.Draft;
    },
});
</script>

<template>
    <LCard title="Basic translation settings" collapsible v-if="content">
        <!-- Title -->
        <LInput
            name="title"
            label="Title"
            required
            :disabled="disabled"
            v-model="content.title"
            @blur="validateSlug"
        />

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
                :disabled="disabled"
                ref="slugInput"
                name="slug"
                size="sm"
                class="w-full"
                v-model="content.slug"
                @blur="
                    isEditingSlug = false;
                    validateSlug();
                "
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
            >
                <!-- Link publish & expiry dates toggle -->
                <!-- <div class="flex items-center justify-between">
                    <FormLabel>Link dates (not implemented yet)</FormLabel>
                    <LToggle v-model="linkedDates" :disabled="disabled || true" />
                </div> -->

                <!-- Publish / draft toggle -->
                <div class="mt-2 flex items-center justify-between">
                    <FormLabel>Status: Draft / Published</FormLabel>
                    <LToggle v-model="publishStatus" :disabled="disabled" data-test="toggle" />
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
            >
                <!-- Expiry date shortcut buttons -->
                <div class="flex w-full cursor-pointer flex-wrap gap-1">
                    <LButton
                        type="button"
                        name="1"
                        variant="custom"
                        class="flex-1"
                        :class="{
                            ' bg-black text-white': selectedExpiryNumber === 1,
                        }"
                        @click="setExpiryNumber(1)"
                        :disabled="disabled"
                    >
                        1
                    </LButton>
                    <LButton
                        type="button"
                        name="2"
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
                        name="3"
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
                        name="6"
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
                        name="W"
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
                        name="M"
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
                        name="Y"
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
                        name="clear"
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
