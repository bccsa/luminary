<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { PencilIcon, ChevronLeftIcon } from "@heroicons/vue/16/solid";
import {
    ContentStatus,
    DocType,
    AclPermission,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type ContentDto,
} from "@/types";
import { computed, nextTick, ref, watch } from "vue";
import { DateTime } from "luxon";
import { Slug } from "@/util/slug";
import { useUserAccessStore } from "@/stores/userAccess";
import { db } from "@/db/baseDatabase";
import { watchDeep } from "@vueuse/core";

const { verifyAccess } = useUserAccessStore();

type Props = {
    docType: DocType;
    language?: LanguageDto;
};
const props = defineProps<Props>();
const parent = defineModel<PostDto | TagDto>("parent");
const content = defineModel<ContentDto>("content");

// Access control
const canTranslate = computed(() => {
    if (!parent || !parent.value || !props.language) return false;
    return (
        verifyAccess(parent.value.memberOf, props.docType, AclPermission.Translate) &&
        verifyAccess(props.language.memberOf, DocType.Language, AclPermission.Translate)
    );
});

// Slug generation
const isEditingSlug = ref(false);
const slugInput = ref<HTMLInputElement | undefined>(undefined);
const updateSlug = async (text: string) => {
    if (!content || !content.value) return;

    console.log("updateSlug", text);
    text = text.trim();
    if (!text) text = content.value.title || "";
    if (!text) return "invalid-slug";

    content.value.slug = await Slug.generate(text, content.value._id || "");
};

let previousTitle: string;
const autoUpdateSlug = async (title: string) => {
    if (!content || !content.value) return;
    if (!previousTitle) previousTitle = content.value.title;

    // Only auto-update if in draft mode
    // Check if the slug is still the default value
    if (
        content.value.status == ContentStatus.Draft &&
        content.value.slug.replace(/-[0-9]*$/g, "") ==
            Slug.generateNonUnique(previousTitle).replace(/-[0-9]*$/g, "")
    ) {
        console.log("autoUpdateSlug", title);
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
</script>

<template>
    <LCard title="Basic translation settings" collapsible v-if="content">
        <LInput
            name="title"
            label="Title"
            required
            :disabled="!canTranslate"
            v-model="content.title"
            @change="(e) => autoUpdateSlug(e.target.value)"
        />
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
                v-if="!isEditingSlug && canTranslate"
                @click="startEditingSlug"
                class="flex h-5 w-5 min-w-5 items-center justify-center rounded-md py-0.5 hover:bg-zinc-200 active:bg-zinc-300"
                title="Edit slug"
            >
                <component :is="PencilIcon" class="h-4 w-4 text-zinc-500" />
            </button>
        </div>

        <LInput
            name="summary"
            label="Summary"
            class="mt-4"
            :disabled="!canTranslate"
            v-model="content.summary"
        />

        <div class="mt-4 flex flex-col gap-4 sm:flex-row">
            <LInput
                name="publishDate"
                label="Publish date"
                class="sm:w-1/2"
                type="datetime-local"
                :disabled="!canTranslate"
                v-model="publishDateString"
                @change="
                    (e) => {
                        if (!content) return;
                        content.publishDate = db.fromIsoDateTime(e.target.value);
                    }
                "
            />
            <LInput
                name="expiryDate"
                label="Expiry date"
                class="group sm:w-1/2"
                type="datetime-local"
                :disabled="!canTranslate"
                v-model="expiryDateString"
                @change="
                    (e) => {
                        if (!content) return;
                        content.expiryDate = db.fromIsoDateTime(e.target.value);
                    }
                "
            >
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
                    >
                        1
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryNumber === 2 }"
                        @click="setExpiryNumber(2)"
                    >
                        2
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryNumber === 3 }"
                        @click="setExpiryNumber(3)"
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
                    >
                        W
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryUnit === 'Month' }"
                        @click="setExpiryUnit('Month')"
                    >
                        M
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        class="flex-1"
                        :class="{ 'bg-black text-white': selectedExpiryUnit === 'Year' }"
                        @click="setExpiryUnit('Year')"
                    >
                        Y
                    </LButton>
                    <LButton
                        type="button"
                        variant="custom"
                        :icon="ChevronLeftIcon"
                        class="flex-1"
                        @click="clearExpiryDate()"
                    >
                    </LButton>
                </div>
            </LInput>
        </div>
    </LCard>
</template>
