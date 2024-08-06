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
import LCard from "@/components/common/LCard.vue";
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

const usedLanguage = computed(() => {
    if (!content.value || !sortedLanguages.value) return null;
    return sortedLanguages.value.find((l) => content.value?.language == l._id);
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
    <LCard padding="none">
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
                    languageCode: languages.find((l) => l._id == content?.language)?.languageCode,
                },
            }"
            data-test="edit-button"
        >
            <div class="flex flex-col hover:bg-zinc-100">
                <span class="m-2 flex items-center justify-between p-0 text-sm text-zinc-900">
                    {{ usedLanguage?.name }}

                    <div class="flex items-center gap-3">
                        <LBadge
                            type="language"
                            :customColor="color"
                            :customIcon="icon"
                            :customText="text"
                            class="-ml-2 w-auto"
                            :variant="translationStatus(content)"
                        />

                        <CheckCircleIcon
                            v-if="
                                router.currentRoute.value.params.languageCode ==
                                usedLanguage?.languageCode
                            "
                            class="-ml-2 h-5 w-5 text-zinc-500"
                        />
                    </div>
                </span>
            </div>
        </RouterLink>

        <div :class="{ ' bg-zinc-100 px-2 py-1': !isValid || isContentDirty }">
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
    </LCard>
</template>
