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
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import LBadge from "../common/LBadge.vue";
import { useRouter, RouterLink } from "vue-router";
import _ from "lodash";
// import { sortByName } from "@/util/sortByName";

type Props = {
    languages: LanguageDto[];
    contentPrev?: ContentDto;
};
const props = defineProps<Props>();
const content = defineModel<ContentDto>("content");
const router = useRouter();

// Computed property or method to get sorted languages
const sortedLanguages = computed(() => {
    if (!props.languages) return [];
    return props.languages.slice().sort((a, b) => a.name.localeCompare(b.name));
});

// Existing computed property using the sorted languages
const contentLanguage = computed(() => {
    if (!content.value || !sortedLanguages.value) return;
    // @ts-ignore we are certain that content exists
    const publishContent = sortedLanguages.value.find((l) => content.value.language == l._id);

    return { publishContent };
});

// const getLanguageCode = (id: string | undefined) => {
//     const language = props.languages.find((l) => l._id === id);
//     return language ? language.languageCode : undefined;
// };

const isContentDirty = computed(() => !_.isEqual(content.value, props.contentPrev));

const emit = defineEmits<{
    (e: "isValid", value: boolean): void;
}>();

const icon = ref();
const color = ref("");
const text = ref("");

const translationStatus = computed(() => {
    return (content: ContentDto | undefined) => {
        if (
            content?.status == PublishStatus.Published &&
            content?.publishDate &&
            new Date(content.publishDate) > new Date()
        ) {
            text.value = "Scheduled";
            icon.value = CheckCircleIcon;
            color.value = "bg-purple-100 ring-purple-200 text-purple-700";
            return;
        }

        if (
            content?.status == PublishStatus.Published &&
            content?.expiryDate &&
            new Date(content.expiryDate) < new Date()
        ) {
            text.value = "Expired";
            icon.value = XCircleIcon;
            color.value = "bg-gray-100 ring-gray-200 text-gray-700";
            return;
        }

        if (content?.status == PublishStatus.Published) {
            text.value = "Published";
            icon.value = CheckCircleIcon;
            color.value = "bg-green-100 ring-green-200 text-green-700";
            return;
        }

        if (content?.status == PublishStatus.Draft) {
            text.value = "Draft";
            icon.value = CheckCircleIcon;
            color.value = "bg-blue-100 ring-blue-200 text-blue-700";
            return;
        }

        return undefined;
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
            <span class="flex justify-between text-sm text-zinc-900">
                {{ contentLanguage?.publishContent?.name }}
                <RouterLink
                    :to="{
                        name: 'edit',
                        params: {
                            docType: content?.parentType,
                            tagType:
                                content?.parentType == DocType.Tag
                                    ? (content as unknown as TagDto).tagType
                                    : undefined,
                            id: content?.parentId,
                            // languageCode: getLanguageCode(contentLanguage?.publishContent?._id),
                            languageCode: languages.find((l) => l._id == content?.language)
                                ?.languageCode,
                        },
                    }"
                    class="flex justify-end"
                    data-test="edit-button"
                >
                    <LBadge
                        type="language"
                        :customColor="color"
                        :customIcon="icon"
                        :customText="text"
                        class="w-auto"
                        :variant="translationStatus(content)"
                    />

                    <div class="ml-4">
                        <CheckCircleIcon
                            v-if="
                                router.currentRoute.value.params.languageCode ==
                                contentLanguage?.publishContent?.languageCode
                            "
                            class="fixed -ml-2 h-5 w-5 text-zinc-500"
                        />
                    </div>
                </RouterLink>
            </span>
        </div>
        <div class="flex items-center gap-2" v-if="!isValid || isContentDirty">
            <p>
                <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
            </p>
            <p class="h-4 text-xs text-zinc-700">Unsaved changes</p>
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
