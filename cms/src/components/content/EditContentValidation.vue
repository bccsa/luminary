<script setup lang="ts">
import {
    PublishStatus,
    type ContentDto,
    type LanguageDto,
    DocType,
    type TagDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { validate, type Validation } from "./ContentValidator";
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import LBadge from "../common/LBadge.vue";
import { RouterLink } from "vue-router";

type Props = {
    languages: LanguageDto[];
};
const props = defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Get the content document's language document
const contentLanguage = computed(() => {
    if (!content.value || !props.languages) return;
    // @ts-ignore we are certain that content exists
    return props.languages.find((l) => content.value.language == l._id);
});

const emit = defineEmits<{
    (e: "isValid", value: boolean): void;
}>();

const statusLanguageTitle = ref("");

const translationStatus = computed(() => {
    return (content: ContentDto | undefined) => {
        if (
            content?.status == PublishStatus.Published &&
            content?.publishDate &&
            new Date(content.publishDate) > new Date()
        ) {
            statusLanguageTitle.value = "Scheduled";
            return "warning";
        }

        if (
            content?.status == PublishStatus.Published &&
            content?.expiryDate &&
            new Date(content.expiryDate) < new Date()
        ) {
            statusLanguageTitle.value = "Expired";
            return "error";
        }

        if (content?.status == PublishStatus.Published) {
            statusLanguageTitle.value = "Published";
            return "success";
        }

        if (content?.status == PublishStatus.Draft) {
            statusLanguageTitle.value = "Draft";
            return "info";
        }

        return "default";
    };
});

const validations = ref([] as Validation[]);

const isValid = ref(true);
watch(
    content,
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
</script>

<template>
    <div class="flex flex-col">
        <div class="flex flex-col gap-2">
            <span class="flex justify-between text-[1em] text-zinc-900">
                {{ contentLanguage?.name }}
                <RouterLink
                    :to="{
                        name: 'edit',
                        params: {
                            docType: content?.parentType,
                            tagType:
                                content?.parentType == DocType.Tag
                                    ? (content as unknown as TagDto).tagType
                                    : undefined,
                            id: content?._id,
                            languageCode: languages.find((l) => l._id == content?.language)
                                ?.languageCode,
                        },
                    }"
                    class="flex justify-end"
                    data-test="edit-button"
                >
                    <LBadge
                        type="language"
                        class="w-auto cursor-pointer"
                        :variant="translationStatus(content)"
                    >
                        {{ statusLanguageTitle }}
                    </LBadge>
                </RouterLink>
            </span>
            <div class="flex items-center gap-2" v-if="!isValid">
                <p>
                    <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                </p>
                <p class="h-4 text-xs text-zinc-700">Unsaved changes</p>
            </div>
        </div>
        <div
            v-for="validation in validations.filter((v) => !v.isValid)"
            :key="validation.id"
            class="flex items-center gap-2"
        >
            <p>
                <XCircleIcon class="h-4 w-4 text-red-400" />
            </p>
            <p class="h-4 text-xs text-zinc-700">{{ validation.message }}</p>
        </div>
    </div>
</template>
