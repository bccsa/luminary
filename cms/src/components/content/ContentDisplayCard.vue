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
import { RouterLink } from "vue-router";
import { DateTime } from "luxon";
import { ClockIcon, TagIcon, UserGroupIcon, UserIcon } from "@heroicons/vue/24/outline";
import router from "@/router";
import { cmsDefaultLanguage, isSmallScreen } from "@/globalConfig";

type Props = {
    groups: GroupDto[];
    contentDoc: ContentDto;
    parentType: DocType.Post | DocType.Tag;
    languageId: Uuid;
    languages: LanguageDto[];
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

const renderDate = (size: "default" | "small", timestampRelevance: string, timestamp: number) =>
    size == "default"
        ? timestamp
            ? db.toDateTime(timestamp).toLocaleString(DateTime.DATETIME_SHORT)
            : `${timestampRelevance} not set`
        : db.toDateTime(timestamp).toLocaleString();

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
    <div
        class="w-full cursor-pointer divide-y divide-zinc-100 border-y border-zinc-300 bg-white px-2 py-1 sm:rounded-md sm:border"
        @click="
            () => {
                if (verifyAccess(contentDoc.memberOf, parentType, AclPermission.View)) {
                    router.push({
                        name: 'edit',
                        params: {
                            docType: parentType,
                            tagOrPostType: contentDoc.parentTagType || contentDoc.parentPostType,
                            id: contentDoc.parentId,
                            languageCode: cmsDefaultLanguage?.languageCode,
                        },
                    });
                }
            }
        "
    >
        <div class="relative flex cursor-pointer items-center justify-between py-1">
            <div
                data-test="content-title"
                class="w-full"
                :class="{
                    'flex justify-between': isSmallScreen,
                }"
            >
                <div class="mr-1 max-w-full truncate text-wrap text-sm font-medium">
                    {{ contentDoc.title }}
                </div>
                <LBadge v-if="isLocalChange && isSmallScreen" variant="warning">
                    Offline changes
                </LBadge>
            </div>

            <div class="flex items-center justify-end">
                <div v-if="!isSmallScreen" class="flex gap-1">
                    <LBadge v-if="isLocalChange" variant="warning" class="flex whitespace-nowrap">
                        Offline changes
                    </LBadge>
                    <RouterLink
                        v-for="language in accessibleLanguages"
                        :key="language._id"
                        :to="navigateToLanguage(language)"
                        @click.stop
                    >
                        <LBadge
                            type="language"
                            withIcon
                            :variant="translationStatus(contentDocs, language)"
                            :class="{
                                'z-20 cursor-pointer hover:opacity-65':
                                    translationStatus(contentDocs, language) !== 'default',
                            }"
                        >
                            {{ language.languageCode }}
                        </LBadge>
                    </RouterLink>
                </div>
            </div>
        </div>

        <div v-if="isSmallScreen" class="flex flex-wrap gap-1 py-1">
            <RouterLink
                v-for="language in accessibleLanguages"
                :key="language._id"
                :to="navigateToLanguage(language)"
                @click.stop
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

        <div class="flex w-full items-center justify-between gap-2 py-1 text-xs">
            <div v-if="tagsContent.length > 0" class="flex w-full items-center gap-1">
                <div>
                    <TagIcon class="h-4 w-4 text-zinc-400" />
                </div>
                <div class="flex flex-wrap gap-1">
                    <LBadge v-for="tag in tagsContent" :key="tag._id" type="default">
                        {{ tag.title }}
                    </LBadge>
                </div>
            </div>
            <span class="flex items-center gap-1 text-xs text-zinc-400" v-else>
                <TagIcon class="h-4 w-4 text-zinc-300" />
                No tags set
            </span>
            <div class="flex items-center justify-end text-zinc-400">
                <ClockIcon class="text-zinc-340 mr-[1px] h-4 w-4" />
                <span title="Last Updated">{{
                    renderDate("default", "Last updated", contentDoc.updatedTimeUtc)
                }}</span>
            </div>
        </div>

        <div v-if="isSmallScreen" class="flex flex-wrap items-center gap-1 py-1">
            <div class="flex flex-1 items-center gap-1">
                <div>
                    <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                </div>
                <div class="flex flex-wrap gap-1">
                    <LBadge v-for="group in groups" :key="group._id" type="default" variant="blue">
                        {{ group.name }}
                    </LBadge>
                </div>
            </div>
            <div class="flex w-max items-start text-xs text-zinc-400">
                <ClockIcon class="mr-[1px] h-4 w-4 text-zinc-400" />
                <span title="Last Updated">{{
                    renderDate("small", "Last Updated", contentDoc.updatedTimeUtc)
                }}</span>
            </div>
        </div>

        <div v-if="!isSmallScreen" class="flex items-center justify-between pt-1 text-xs sm:gap-4">
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge v-for="group in groups" :key="group._id" type="default" variant="blue">
                    {{ group.name }}
                </LBadge>
            </div>

            <div class="flex items-center gap-1 text-xs text-zinc-400">
                <UserIcon class="h-4 w-4 text-zinc-400" />
                <span title="Last Updated By">{{
                    `Last Updated By: ${contentDoc.updatedBy || "Unknown"}`
                }}</span>
            </div>
        </div>
    </div>
</template>
