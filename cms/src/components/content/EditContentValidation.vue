<script setup lang="ts">
import { PublishStatus, type ContentDto, type LanguageDto } from "luminary-shared";
import { computed, ref, watch } from "vue";
import { validate, type Validation } from "./ContentValidator";
import { XCircleIcon } from "@heroicons/vue/20/solid";

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
    <div class="flex flex-col" v-if="!isValid">
        <span class="mb-0.5 text-sm text-zinc-900">
            {{ contentLanguage?.name }}
        </span>
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
