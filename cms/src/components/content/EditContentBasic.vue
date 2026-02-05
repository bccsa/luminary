<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LTextToggle from "@/components/forms/LTextToggle.vue";
import {
    PublishStatus,
    type ContentDto,
    db,
    type RedirectDto,
    DocType,
    useDexieLiveQuery,
    type LanguageDto,
} from "luminary-shared";
import { computed, nextTick, ref, watch } from "vue";
import { DateTime } from "luxon";
import { BackspaceIcon } from "@heroicons/vue/20/solid";
import FormLabel from "../forms/FormLabel.vue";
import { Slug } from "@/util/slug";
import { ExclamationCircleIcon } from "@heroicons/vue/16/solid";

type Props = {
    selectedLanguage?: LanguageDto;
    disabled: boolean;
    disablePublish: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Slug generation
const isEditingSlug = ref(false);
const isEditingTitle = ref(false);
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
    () => {
        if (!content.value) return;

        // Don't interfere if user is actively editing the slug field specifically
        if (isEditingSlug.value) return;

        const titleChanged = previousTitle != content.value.title;
        const slugChanged = previousSlug != content.value.slug;

        // Only update the slug if the title or slug has changed
        if (
            !titleChanged &&
            !slugChanged &&
            ((content.value.title && content.value.slug) || !content.value.title)
        ) {
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
            content.value.slug = Slug.generateNonUnique(content.value.title);
        }

        // Validate slug (but only if slug changed and user is not editing it)
        if (slugChanged && !isEditingSlug.value) {
            content.value.slug = Slug.generateNonUnique(content.value.slug);
        }

        previousTitle = content.value.title;
        previousSlug = content.value.slug;
    },
    { deep: true, immediate: true },
);

const validateSlug = async () => {
    if (!content.value) return;
    content.value.slug = await Slug.generate(content.value.slug, content.value._id || "");
};

// Tabs for Title & Summary
const currentToogle = ref("visible"); // Default tab key

// A Dexie live query to check if a redirect exists for the current slug
// This is used to warn the user if they are editing a slug that already has a redirect
const existingRedirectForSlug = useDexieLiveQuery(
    () => {
        const slug = content.value?.slug;

        return db.docs
            .where("type")
            .equals(DocType.Redirect)
            .and((d) => {
                const doc = d as RedirectDto;
                return doc.slug === slug;
            })
            .toArray() as unknown as Promise<RedirectDto[]>;
    },
    { initialValue: [] },
);

const publishDateString = computed({
    get() {
        if (!content.value || !content.value.publishDate) return;
        return db.toIsoDateTime(content.value.publishDate) || undefined;
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
        return db.toIsoDateTime(content.value.expiryDate) || undefined;
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
const showPublishDateWarning = ref(false);

const calculateExpiryDate = () => {
    if (
        !content.value ||
        !content.value.publishDate ||
        !selectedExpiryNumber.value ||
        !selectedExpiryUnit.value
    ) {
        showPublishDateWarning.value = true; // Show warning if publish date is not set
        return;
    }

    showPublishDateWarning.value = false; // Hide warning if publish date is set

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
    showPublishDateWarning.value = false; // Hide warning when clearing
};
</script>

<template>
    <LCard
        :title="selectedLanguage ? selectedLanguage.name : 'Content'"
        collapsible
        v-if="content"
        class="bg-white pb-1"
    >
        <template #actions>
            <LTextToggle
                v-model="currentToogle"
                leftLabel="Visible"
                :leftValue="'visible'"
                rightLabel="SEO"
                :rightValue="'seo'"
                :disabled="disabled"
                @click.stop
            />
        </template>

        <div v-if="currentToogle === 'visible'">
            <div class="grid grid-cols-[auto_1fr] items-center gap-2">
                <div class="col-span-2 flex flex-col gap-4 text-center">
                    <!-- Warning message -->
                    <div
                        v-show="showPublishDateWarning && !content.publishDate"
                        class="text-xs text-red-600"
                    >
                        Please set a publish date before using the expiry shortcut.
                    </div>
                </div>

                <!-- Title -->
                <FormLabel>Title</FormLabel>
                <LInput
                    name="title"
                    required
                    :disabled="disabled"
                    v-model="content.title"
                    @focus="isEditingTitle = true"
                    @blur="
                        isEditingTitle = false;
                        validateSlug();
                    "
                />

                <!-- Slug -->
                <FormLabel class="self-start">Slug:</FormLabel>
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 align-top text-zinc-800">
                        <span
                            v-show="!isEditingSlug"
                            data-test="slugSpan"
                            @click="startEditingSlug"
                            class="inline-block min-h-4 min-w-6 rounded-md bg-zinc-200 px-1.5 py-0.5 text-sm"
                            >{{ content.slug }}</span
                        >
                        <LInput
                            v-show="isEditingSlug"
                            :disabled="disabled"
                            ref="slugInput"
                            name="slug"
                            size="sm"
                            class="flex-1"
                            v-model="content.slug"
                            @blur="
                                isEditingSlug = false;
                                validateSlug();
                            "
                            @keydown.enter="
                                isEditingSlug = false;
                                validateSlug();
                            "
                        />
                    </div>
                    <span
                        v-if="existingRedirectForSlug.length > 0"
                        :title="`This slug redirects to '/${existingRedirectForSlug[0].toSlug}'`"
                        class="flex items-center gap-1 text-xs"
                    >
                        <ExclamationCircleIcon class="size-4 text-yellow-400" />
                        A redirect exists for this slug
                    </span>
                </div>

                <!-- Author -->
                <FormLabel>Author</FormLabel>
                <LInput
                    name="author"
                    v-model="content.author"
                    placeholder="John Doe..."
                    :disabled="disabled"
                    inlineLabel
                />

                <!-- Summary -->
                <FormLabel class="self-start">Summary</FormLabel>
                <LInput
                    name="summary"
                    :disabled="disabled"
                    inputType="textarea"
                    placeholder="A short summary of the content..."
                    v-model="content.summary"
                    class="min-h-2"
                />

                <!-- Publish date -->
                <FormLabel>Publish date</FormLabel>
                <LInput
                    name="publishDate"
                    type="datetime-local"
                    :disabled="disabled"
                    v-model="publishDateString"
                />

                <!-- Expiry date -->
                <FormLabel class="self-start">Expiry date</FormLabel>
                <LInput
                    name="expiryDate"
                    type="datetime-local"
                    :disabled="disabled"
                    v-model="expiryDateString"
                />

                <!-- Expiry date shortcut buttons -->
                <div class="col-span-2">
                    <div class="mb-1 flex flex-wrap gap-1 sm:flex-row">
                        <LButton
                            type="button"
                            name="1"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{
                                '!bg-black !text-white': selectedExpiryNumber === 1,
                            }"
                            @click="setExpiryNumber(1)"
                            :disabled="disabled"
                        >
                            1
                        </LButton>
                        <LButton
                            type="button"
                            name="2"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{ '!bg-black !text-white': selectedExpiryNumber === 2 }"
                            @click="setExpiryNumber(2)"
                            :disabled="disabled"
                        >
                            2
                        </LButton>
                        <LButton
                            type="button"
                            name="3"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{ '!bg-black !text-white': selectedExpiryNumber === 3 }"
                            @click="setExpiryNumber(3)"
                            :disabled="disabled"
                        >
                            3
                        </LButton>
                        <LButton
                            type="button"
                            name="6"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{ '!bg-black !text-white': selectedExpiryNumber === 6 }"
                            @click="setExpiryNumber(6)"
                            :disabled="disabled"
                        >
                            6
                        </LButton>
                        <LButton
                            type="button"
                            name="W"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{ '!bg-black !text-white': selectedExpiryUnit === 'Week' }"
                            @click="setExpiryUnit('Week')"
                            data-test="W"
                            :disabled="disabled"
                        >
                            W
                        </LButton>
                        <LButton
                            type="button"
                            name="M"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{ '!bg-black !text-white': selectedExpiryUnit === 'Month' }"
                            @click="setExpiryUnit('Month')"
                            :disabled="disabled"
                        >
                            M
                        </LButton>
                        <LButton
                            type="button"
                            name="Y"
                            variant="secondary"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            :class="{ '!bg-black !text-white': selectedExpiryUnit === 'Year' }"
                            @click="setExpiryUnit('Year')"
                            :disabled="disabled"
                        >
                            Y
                        </LButton>
                        <LButton
                            type="button"
                            name="clear"
                            variant="secondary"
                            :icon="BackspaceIcon"
                            class="min-w-[2.5rem] flex-1 basis-0"
                            @click="clearExpiryDate()"
                            :disabled="disabled"
                        />
                    </div>
                </div>
            </div>

            <!-- Copyright -->
            <div class="mt-2 flex items-center gap-5">
                <FormLabel class="whitespace-nowrap">Copyright</FormLabel>
                <LInput
                    name="copyright"
                    :disabled="disabled"
                    inputType="textarea"
                    placeholder="© 2024 My Company"
                    v-model="content.copyright"
                    class="flex-1"
                />
            </div>

            <!-- Status -->
            <div class="mt-2 flex items-center justify-between gap-2">
                <FormLabel class="self-start py-2">Status</FormLabel>
                <LTextToggle
                    v-model="content.status"
                    leftLabel="Draft"
                    :leftValue="PublishStatus.Draft"
                    rightLabel="Publishable"
                    :rightValue="PublishStatus.Published"
                    :disabled="disabled || disablePublish"
                />
            </div>
        </div>

        <div v-else-if="currentToogle === 'seo'">
            <div class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
                <!-- Seo -->
                <FormLabel>Title</FormLabel>
                <LInput
                    name="seo-title"
                    :disabled="disabled"
                    :placeholder="content.title"
                    v-model="content.seoTitle"
                />

                <!-- Summary SEO -->
                <FormLabel>Summary</FormLabel>
                <LInput
                    name="seo-summary"
                    :disabled="disabled"
                    :placeholder="content.summary"
                    v-model="content.seoString"
                />
            </div>
        </div>
    </LCard>
</template>
