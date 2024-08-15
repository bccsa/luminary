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
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/20/solid";
import LBadge, { variants } from "../common/LBadge.vue";
import { useRouter, RouterLink } from "vue-router";
import _ from "lodash";
import LCard from "@/components/common/LCard.vue";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    languages: LanguageDto[];
    contentPrev?: ContentDto;
};
const props = defineProps<Props>();
const content = defineModel<ContentDto>("content");
const router = useRouter();

const sortedLanguages = computed(() => {
    if (!props.languages) return [];
    return props.languages.slice().sort((a, b) => a.name.localeCompare(b.name));
});

const usedLanguage = computed(() => {
    if (!content.value || !sortedLanguages.value) return null;
    return sortedLanguages.value.find((l) => content.value?.language == l._id);
});

const isContentDirty = computed(() => !_.isEqual(content.value, props.contentPrev));

const emit = defineEmits<{
    (e: "isValid", value: boolean): void;
}>();

const statusBadge: ComputedRef<{ title: string; variant: keyof typeof variants }> = computed(() => {
    if (!content.value) {
        return { title: "Unknown", variant: "default" };
    }

    if (
        content.value.status == PublishStatus.Published &&
        content.value.publishDate &&
        content.value.publishDate > Date.now()
    ) {
        return { title: "Scheduled", variant: "scheduled" };
    }

    if (
        content.value.status == PublishStatus.Published &&
        content.value.expiryDate &&
        content.value.expiryDate < Date.now()
    ) {
        return { title: "Expired", variant: "default" };
    }

    if (content.value.status == PublishStatus.Published) {
        return {
            title: "Published",
            variant: "success",
        };
    }

    return {
        title: capitaliseFirstLetter(content.value.status),
        variant: "info",
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
            <div>
                <div class="flex flex-col hover:bg-zinc-100">
                    <span class="m-2 flex items-center justify-between p-0 text-sm text-zinc-900">
                        <div class="static">
                            <CheckCircleIcon
                                v-if="
                                    router.currentRoute.value.params.languageCode ==
                                    usedLanguage?.languageCode
                                "
                                class="absolute -left-[-11.3px] -ml-2 h-4 w-4 text-zinc-500"
                            />
                            {{ usedLanguage?.name }}
                        </div>

                        <div class="flex items-center gap-3">
                            <LBadge withIcon class="-ml-2 w-auto" :variant="statusBadge.variant">
                                {{ statusBadge.title }}
                            </LBadge>
                        </div>
                    </span>
                </div>
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
