<script setup lang="ts">
import {
    PublishStatus,
    type ContentDto,
    type LanguageDto,
    DocType,
    type TagDto,
} from "luminary-shared";
import { computed, ref, watch, type ComputedRef } from "vue";
import { validate, type Validation } from "./ContentValidator";
import {
    ExclamationCircleIcon,
    XCircleIcon,
    ArrowRightIcon,
    TrashIcon as TrashIconSolid,
} from "@heroicons/vue/16/solid";
import LBadge, { variants } from "../common/LBadge.vue";
import { RouterLink } from "vue-router";
import _ from "lodash";
import { capitaliseFirstLetter } from "@/util/string";
import LDialog from "../common/LDialog.vue";

type Props = {
    languages: LanguageDto[];
    existingContent?: ContentDto;
    isLanguageSelectorSticky?: boolean;
    canDelete: boolean;
};
const props = defineProps<Props>();
const editableContent = defineModel<ContentDto>("editableContent");
const sortedLanguages = computed(() => {
    if (!props.languages) return [];
    return props.languages.slice().sort((a, b) => a.name.localeCompare(b.name));
});

const isCardCollapsed = defineModel<boolean>("isCardCollapsed");
const showDeleteModal = ref(false);

const usedLanguage = computed(() => {
    if (!editableContent.value || !sortedLanguages.value) return null;
    return sortedLanguages.value.find((l) => editableContent.value?.language == l._id);
});

const isContentDirty = computed(() => {
    if (!editableContent.value || !props.existingContent) return false;

    // Create copies without parentMedia for comparison since parentMedia is synchronized from parent
    const editableWithoutParentMedia = { ...editableContent.value };
    delete editableWithoutParentMedia.parentMedia;

    const existingWithoutParentMedia = { ...props.existingContent };
    delete existingWithoutParentMedia.parentMedia;

    return !_.isEqual(editableWithoutParentMedia, existingWithoutParentMedia);
});

const emit = defineEmits<{
    (e: "isValid", value: boolean): void;
}>();

const statusBadge: ComputedRef<
    (dto: ContentDto | undefined) => { title: string; variant: keyof typeof variants }
> = computed(() => (dto: ContentDto | undefined) => {
    if (!dto) {
        return { title: "Unknown", variant: "default" };
    }

    if (dto.status == PublishStatus.Published && dto.publishDate && dto.publishDate > Date.now()) {
        return { title: "Scheduled", variant: "scheduled" };
    }

    if (dto.status == PublishStatus.Published && dto.expiryDate && dto.expiryDate < Date.now()) {
        return { title: "Expired", variant: "expired" };
    }

    if (dto.status == PublishStatus.Published) {
        return {
            title: "Published",
            variant: "success",
        };
    }

    return {
        title: capitaliseFirstLetter(dto.status),
        variant: "info",
    };
});

const statusChanged = computed(
    () =>
        statusBadge.value(props.existingContent).title !=
        statusBadge.value(editableContent.value).title,
);

const validations = ref([] as Validation[]);

const isValid = ref(true);
watch(
    editableContent,
    (content) => {
        if (!content) return;

        validate(
            "A title is required",
            "title",
            validations.value,
            content,
            () => content.title != undefined && content.title.trim().length > 0,
        );

        validate(
            "A slug is required",
            "slug",
            validations.value,
            content,
            () => content.slug != undefined && content.slug.length > 0,
        );

        validate(
            "The expiry date must be after the publish date",
            "expiryDate",
            validations.value,
            content,
            () => {
                if (!content.expiryDate || !content.publishDate) return true;
                return content.expiryDate > content.publishDate;
            },
        );

        validate("A publish date is required", "publishDate", validations.value, content, () => {
            if (content.status == PublishStatus.Draft) return true;
            return content.publishDate != undefined && content.publishDate != null;
        });

        isValid.value = validations.value.every((v) => v.isValid);
        emit("isValid", isValid.value);
    },
    { immediate: true, deep: true },
);

const deleteTranslation = () => {
    if (!editableContent.value) return;
    editableContent.value.deleteReq = 1;
};
</script>

<template>
    <RouterLink
        :to="{
            name: 'edit',
            params: {
                docType: editableContent?.parentType,
                tagType:
                    editableContent?.parentType == DocType.Tag
                        ? (editableContent as unknown as TagDto).tagType
                        : undefined,
                id: editableContent?.parentId,
                languageCode: languages.find((l) => l._id == editableContent?.language)
                    ?.languageCode,
            },
        }"
        @click.prevent="if (isLanguageSelectorSticky) isCardCollapsed = true;"
        v-slot="{ isActive }"
    >
        <div
            v-if="languages.find((l) => l._id == editableContent?.language)"
            :class="[
                'mx-1.5 rounded-md p-1.5 px-2 sm:px-1',
                {
                    'mb-0 cursor-default bg-yellow-100/40 shadow': isActive && !isCardCollapsed,
                    'border-1.5 cursor-default bg-white shadow': isActive && isCardCollapsed,
                    'border bg-white/80 hover:bg-white/100': !isActive,
                },
            ]"
        >
            <div class="flex flex-col">
                <span class="mx-1.5 flex items-center justify-between text-sm text-zinc-900">
                    <div class="flex h-8 w-full items-center justify-start">
                        {{ usedLanguage?.name }}
                    </div>
                    <div class="flex items-center gap-1">
                        <template v-if="statusChanged">
                            <LBadge
                                withIcon
                                :variant="statusBadge(existingContent).variant"
                                class="opacity-70"
                            >
                                {{ statusBadge(existingContent).title }}
                            </LBadge>
                            <ArrowRightIcon class="h-4 w-4 text-zinc-700" />
                        </template>

                        <LBadge withIcon :variant="statusBadge(editableContent).variant">
                            {{ statusBadge(editableContent).title }}
                        </LBadge>
                    </div>
                    <div
                        data-test="translation-delete-button"
                        @click="showDeleteModal = true"
                        v-if="props.canDelete"
                    >
                        <TrashIconSolid
                            class="ml-2 h-4 min-h-4 w-4 min-w-4 cursor-pointer text-slate-400 hover:text-red-500"
                        />
                    </div>
                </span>
            </div>

            <div v-if="!isValid || isContentDirty" class="mt-2 flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                    <p>
                        <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                    </p>
                    <p class="text-xs text-zinc-700">Unsaved changes</p>
                </div>
                <div
                    v-for="validation in validations.filter((v) => !v.isValid)"
                    :key="validation.id"
                    class="flex items-center gap-2"
                >
                    <p>
                        <XCircleIcon class="h-4 w-4 text-red-400" />
                    </p>
                    <p class="text-xs text-zinc-700">{{ validation.message }}</p>
                </div>
            </div>
        </div>
    </RouterLink>
    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete ${usedLanguage?.name}`"
        :description="`Are you sure you want to delete this ${usedLanguage?.name}?`"
        :primaryAction="
            () => {
                deleteTranslation();
                showDeleteModal = false;
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="default"
    ></LDialog>
</template>
