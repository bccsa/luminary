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
import DisplayCard from "../common/DisplayCard.vue";
import { RouterLink } from "vue-router";
import { TagIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { cmsDefaultLanguage } from "@/globalConfig";

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

const navigateTo = computed(() => {
    if (verifyAccess(props.contentDoc.memberOf, props.parentType, AclPermission.View)) {
        return {
            name: "edit",
            params: {
                docType: props.parentType,
                tagOrPostType: props.contentDoc.parentTagType || props.contentDoc.parentPostType,
                id: props.contentDoc.parentId,
                languageCode: cmsDefaultLanguage.value?.languageCode,
            },
        };
    }
    return undefined;
});
</script>

<template>
    <DisplayCard
        :title="contentDoc.title"
        :updated-time-utc="contentDoc.updatedTimeUtc"
        :is-local-change="isLocalChange"
        :navigate-to="navigateTo"
        :can-navigate="verifyAccess(contentDoc.memberOf, parentType, AclPermission.View)"
    >
        <template #top-badges>
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
        </template>

        <template #mobile-top-badges>
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
        </template>

        <template #content>
            <div class="flex w-full items-center gap-2 py-1 text-xs">
                <div v-if="tagsContent.length > 0" class="flex w-full items-center gap-1 sm:w-1/2">
                    <div>
                        <TagIcon class="h-4 w-4 text-zinc-400" />
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <LBadge v-for="tag in tagsContent" :key="tag._id" type="default">
                            {{ tag.title }}
                        </LBadge>
                    </div>
                </div>
                <span class="flex w-1/2 items-center gap-1 text-xs text-zinc-400" v-else>
                    <TagIcon class="h-4 w-4 text-zinc-300" />
                    No tags set
                </span>
            </div>
        </template>

        <template #mobile-footer>
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
        </template>

        <template #desktop-footer>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge v-for="group in groups" :key="group._id" type="default" variant="blue">
                    {{ group.name }}
                </LBadge>
            </div>
        </template>
    </DisplayCard>
</template>
