<script setup lang="ts">
import {
    db,
    PublishStatus,
    DocType,
    type ContentDto,
    type LanguageDto,
    type Uuid,
    AclPermission,
    verifyAccess,
    TagType,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import LBadge from "../common/LBadge.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";
import LButton from "../button/LButton.vue";
import { DateTime } from "luxon";

type Props = {
    contentDoc: ContentDto;
    parentType: DocType.Post | DocType.Tag;
    languageId: Uuid;
    languages: LanguageDto[];
    tagType?: TagType;
};
const props = defineProps<Props>();
const contentDocs = db.whereParentAsRef(props.contentDoc.parentId, props.parentType, undefined, []);
const isLocalChange = db.isLocalChangeAsRef(props.contentDoc._id);

// Get the tags
const tagsContent = ref<ContentDto[]>([]);

watch(
    contentDocs,
    async () => {
        if (!contentDocs.value || contentDocs.value.length === 0) return;

        tagsContent.value = await db.whereParent(
            contentDocs.value[0].parentTags,
            DocType.Tag,
            contentDocs.value[0].language,
        );
    },
    { immediate: true },
);

// Determine the status of the translation
const translationStatus = computed(() => {
    return (content: ContentDto[], language: LanguageDto) => {
        const item = content.find((c: ContentDto) => c.language == language._id);

        if (!item) {
            return "default";
        }

        if (item.status == PublishStatus.Published) {
            return "success";
        }

        if (item.status == PublishStatus.Draft) {
            return "info";
        }

        return "default";
    };
});
</script>

<template>
    <tr>
        <!-- title -->
        <td class="whitespace-wrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ contentDoc.title }}
        </td>

        <!-- status -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <LBadge v-if="isLocalChange" variant="warning"> Offline changes </LBadge>
        </td>
        <!-- translations -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-3">
            <div class="flex flex-wrap gap-2" v-if="contentDocs.length > 0">
                <RouterLink
                    custom
                    v-for="language in languages"
                    :key="language._id"
                    v-slot="{ navigate }"
                    :to="{
                        name: 'edit',
                        params: {
                            docType: parentType,
                            tagType: contentDoc.tagType,
                            id: contentDoc.parentId,
                            languageCode: languages.find((l: LanguageDto) => l._id == language._id)
                                ?.languageCode,
                        },
                    }"
                >
                    <LBadge
                        @click="
                            translationStatus(contentDocs, language) == 'default' ? '' : navigate()
                        "
                        type="language"
                        :variant="translationStatus(contentDocs, language)"
                        :class="{
                            'cursor-pointer hover:opacity-75':
                                translationStatus(contentDocs, language) !== 'default',
                        }"
                    >
                        {{ language.languageCode }}
                    </LBadge>
                </RouterLink>
            </div>
        </td>

        <!-- tags -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <div class="flex max-w-xs flex-wrap gap-2">
                <LBadge v-for="tag in tagsContent" :key="tag._id" type="default" class="text-lg">
                    {{ tag.title }}
                </LBadge>
            </div>
        </td>

        <!-- publish date -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(contentDoc.publishDate!).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- expiring date -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{
                contentDoc.expiryDate
                    ? db.toDateTime(contentDoc.expiryDate).toLocaleString(DateTime.DATETIME_SHORT)
                    : "Not set"
            }}
        </td>

        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(contentDoc.updatedTimeUtc).toLocaleString(DateTime.DATETIME_SHORT) }}
        </td>

        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                v-if="verifyAccess(contentDoc.memberOf, parentType, AclPermission.View)"
                variant="tertiary"
                :icon="
                    verifyAccess(contentDoc.memberOf, parentType, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                :is="RouterLink"
                :to="{
                    name: 'edit',
                    params: {
                        docType: parentType,
                        tagType: contentDoc.tagType,
                        id: contentDoc.parentId,
                        languageCode: languages.find((l: LanguageDto) => l._id == languageId)
                            ?.languageCode,
                    },
                }"
                class="flex justify-end"
                data-test="edit-button"
            ></LButton>
        </td>
    </tr>
</template>
