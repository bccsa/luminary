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
    type GroupDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import LBadge from "../common/LBadge.vue";
import { EyeIcon, PencilSquareIcon, ClockIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";
import { DateTime } from "luxon";
import { CloudArrowUpIcon, TagIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { PencilIcon } from "@heroicons/vue/24/solid";
import LButton from "../button/LButton.vue";

type Props = {
    groups: GroupDto[];
    contentDoc: ContentDto;
    parentType: DocType.Post | DocType.Tag;
    languageId: Uuid;
    languages: LanguageDto[];
    isSmallScreen: boolean;
};

const props = defineProps<Props>();

const contentDocs = db.whereParentAsRef(props.contentDoc.parentId, props.parentType, undefined, []);
const isLocalChange = db.isLocalChangeAsRef(props.contentDoc._id);

const tagsContent = ref<ContentDto[]>([]);

const accessibleLanguages = computed(() =>
    props.languages.filter((language) =>
        verifyAccess(language.memberOf, DocType.Language, AclPermission.Translate),
    ),
);

watch(
    contentDocs,
    async () => {
        if (!contentDocs.value || contentDocs.value.length === 0) return;
        tagsContent.value = await db.whereParent(
            contentDocs.value[0].parentTags,
            DocType.Tag,
            props.languageId,
        );
    },
    { immediate: true },
);

const translationStatus = computed(() => {
    return (content: ContentDto[], language: LanguageDto) => {
        const item = content.find((c) => c.language === language._id);
        if (!item) return "default";
        if (
            item.status === PublishStatus.Published &&
            item.publishDate &&
            item.publishDate > Date.now()
        )
            return "scheduled";
        if (
            item.status === PublishStatus.Published &&
            item.expiryDate &&
            item.expiryDate < Date.now()
        )
            return "expired";
        if (item.status === PublishStatus.Published) return "success";
        if (item.status === PublishStatus.Draft) return "info";
        return "default";
    };
});

const renderDate = (timestampRelevance: string, timestamp?: number) =>
    timestamp
        ? db.toDateTime(timestamp).toLocaleString(DateTime.DATETIME_SHORT)
        : `${timestampRelevance} not set`;

const navigateToLanguage = (language: LanguageDto) => {
    const langCode = props.languages.find((l) => l._id === language._id)?.languageCode;
    return {
        name: "edit",
        params: {
            docType: props.parentType,
            tagType: props.contentDoc.tagType,
            id: props.contentDoc.parentId,
            languageCode: langCode,
        },
    };
};
</script>

<template>
    <div class="p w-full divide-y divide-zinc-100 rounded-md bg-white px-2 py-1 shadow-md">
        <div class="relative flex items-center justify-between">
            <!-- Centered Title (absolute only on md and up) -->
            <div class="truncate text-sm font-medium sm:max-w-[70vw]">
                {{ contentDoc.title }}
            </div>

            <div class="flex items-center">
                <!-- Language badges (only on desktop) -->
                <div v-if="!isSmallScreen" class="flex flex-wrap gap-1">
                    <LBadge v-if="isLocalChange" variant="warning"> Offline changes </LBadge>
                    <RouterLink
                        v-for="language in accessibleLanguages"
                        :key="language._id"
                        :to="navigateToLanguage(language)"
                    >
                        <LBadge
                            type="language"
                            withIcon
                            :variant="translationStatus(contentDocs, language)"
                            :class="{
                                'cursor-pointer hover:opacity-65':
                                    translationStatus(contentDocs, language) !== 'default',
                            }"
                        >
                            {{ language.languageCode }}
                        </LBadge>
                    </RouterLink>
                </div>

                <!-- Edit/View Button -->
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
                            tagOrPostType: contentDoc.parentTagType || contentDoc.parentPostType,
                            id: contentDoc.parentId,
                            languageCode: languages.find((l: LanguageDto) => l._id == languageId)
                                ?.languageCode,
                        },
                    }"
                    class="h-5 w-10 shrink-0"
                    data-test="edit-button"
                />
            </div>
        </div>

        <div v-if="isSmallScreen" class="flex flex-wrap gap-1 py-1">
            <RouterLink
                v-for="language in accessibleLanguages"
                :key="language._id"
                :to="navigateToLanguage(language)"
            >
                <LBadge
                    type="language"
                    withIcon
                    :variant="translationStatus(contentDocs, language)"
                    :class="{
                        'cursor-pointer hover:opacity-65':
                            translationStatus(contentDocs, language) !== 'default',
                    }"
                >
                    {{ language.languageCode }}
                </LBadge>
            </RouterLink>
        </div>

        <!-- Tags + Groups -->
        <div class="flex w-full items-center gap-2 py-1">
            <div v-if="tagsContent.length > 0" class="flex w-1/2 flex-wrap items-center gap-1">
                <TagIcon class="h-4 w-4 text-zinc-400" />
                <LBadge v-for="tag in tagsContent" :key="tag._id" type="default">
                    {{ tag.title }}
                </LBadge>
            </div>
            <span class="flex w-1/2 items-center gap-1 text-xs" v-else>
                <TagIcon class="h-4 w-4 text-zinc-400" />
                No tags set
            </span>
            <div v-if="!isSmallScreen" class="flex flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge v-for="group in groups" :key="group._id" type="default">
                    {{ group.name }}
                </LBadge>
            </div>
        </div>
        <div v-if="isSmallScreen" class="flex flex-wrap items-center gap-1 py-1">
            <UserGroupIcon class="h-4 w-4 text-zinc-400" />
            <LBadge v-for="group in groups" :key="group._id" type="default">
                {{ group.name }}
            </LBadge>
        </div>

        <!-- Dates -->
        <div class="flex justify-between pt-2 text-xs sm:gap-4">
            <div class="flex gap-2" :class="isSmallScreen ? 'w-full justify-between' : ''">
                <div class="flex items-center justify-start">
                    <CloudArrowUpIcon class="h-4 w-4 text-zinc-400" />
                    <span title="Publish Date">{{
                        renderDate("Publish Date", contentDoc.publishDate)
                    }}</span>
                </div>
                <div class="flex items-center justify-center">
                    <ClockIcon class="h-4 w-4 text-zinc-400" />
                    <span title="Expiry Date">{{
                        renderDate("Expiry Date", contentDoc.expiryDate)
                    }}</span>
                </div>
            </div>
            <div v-if="!isSmallScreen" class="flex items-center justify-end">
                <PencilIcon class="h-4 w-4 text-zinc-400" />
                <span title="Last Updated">{{
                    renderDate("Last Updated", contentDoc.updatedTimeUtc)
                }}</span>
            </div>
        </div>
    </div>
</template>
