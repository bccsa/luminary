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
import { ExclamationCircleIcon, XCircleIcon, ArrowRightIcon } from "@heroicons/vue/16/solid";
import LBadge, { variants } from "../common/LBadge.vue";
import { RouterLink } from "vue-router";
import _ from "lodash";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    languages: LanguageDto[];
    contentPrev?: ContentDto;
};
const props = defineProps<Props>();
const content = defineModel<ContentDto>("content");
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
    () => statusBadge.value(props.contentPrev).title != statusBadge.value(content.value).title,
);

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
        v-slot="{ isActive }"
    >
        <div
            :class="[
                'rounded-md p-4',
                {
                    'bg-white  shadow': isActive,
                    'hover:bg-zinc-50': !isActive,
                },
            ]"
        >
            <div class="flex flex-col">
                <span class="flex items-center justify-between text-sm text-zinc-900">
                    {{ usedLanguage?.name }}

                    <div class="flex items-center gap-1">
                        <template v-if="statusChanged">
                            <LBadge
                                withIcon
                                :variant="statusBadge(contentPrev).variant"
                                class="opacity-70"
                            >
                                {{ statusBadge(contentPrev).title }}
                            </LBadge>
                            <ArrowRightIcon class="h-4 w-4 text-zinc-700" />
                        </template>

                        <LBadge withIcon :variant="statusBadge(content).variant">
                            {{ statusBadge(content).title }}
                        </LBadge>
                    </div>
                </span>
            </div>

            <div v-if="!isValid || isContentDirty" class="mt-2 flex flex-col gap-0.5">
                <div class="flex items-center gap-1">
                    <p>
                        <ExclamationCircleIcon class="h-4 w-4 text-yellow-400" />
                    </p>
                    <p class="text-xs text-zinc-700">Unsaved changes</p>
                </div>
                <div
                    v-for="validation in validations.filter((v) => !v.isValid)"
                    :key="validation.id"
                    class="flex items-center gap-1"
                >
                    <p>
                        <XCircleIcon class="h-4 w-4 text-red-400" />
                    </p>
                    <p class="text-xs text-zinc-700">{{ validation.message }}</p>
                </div>
            </div>
        </div>
    </RouterLink>
</template>
