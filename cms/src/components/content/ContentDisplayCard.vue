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
    useHybridQuery,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import LBadge from "../common/LBadge.vue";
import DisplayCard from "../common/DisplayCard.vue";
import { RouterLink } from "vue-router";
import { useHasLocalChange } from "@/composables/useHasLocalChange";
import { TagIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { cmsDefaultLanguage } from "@/globalConfig";
import { buildSearchHighlight } from "./ContentOverview/searchHighlight";

type Props = {
    groups: GroupDto[];
    contentDoc: ContentDto;
    parentType: DocType.Post | DocType.Tag;
    languageId: Uuid;
    languages: LanguageDto[];
    /**
     * When set (search mode), the card shows why it matched: a highlighted title,
     * an author-match line, and a content snippet. When undefined (browse), the card
     * renders normally.
     */
    searchQuery?: string;
    /**
     * Strict search matches only title/author, so the body snippet is irrelevant —
     * suppress it. (Related/fuzzy search leaves it on.)
     */
    hideBodySnippet?: boolean;
};

const props = defineProps<Props>();

const highlight = computed(() =>
    props.searchQuery && props.searchQuery.trim()
        ? buildSearchHighlight(props.contentDoc, props.searchQuery)
        : undefined,
);

// All translations of this card's parent (no language filter), Dexie-first via HybridQuery. The
// top-level `type` is required — without it HybridQuery.readType returns undefined and routes
// API-only. `parentId` alone scopes to the parent (parentType is redundant given the unique
// parentId), and `{ type, parentId }` matches the `[type+parentId]` index — no full-table-scan warning.
const contentDocs = useHybridQuery<ContentDto>(
    () => ({
        selector: {
            type: DocType.Content,
            parentId: props.contentDoc.parentId,
        },
    }),
    { live: true },
);
const isLocalChange = useHasLocalChange(props.contentDoc._id);

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
        :title-html="highlight?.titleHtml"
        :updated-time-utc="contentDoc.updatedTimeUtc"
        :is-local-change="isLocalChange"
        :navigate-to="navigateTo"
        :can-navigate="verifyAccess(contentDoc.memberOf, parentType, AclPermission.View)"
    >
        <template #topBadges>
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

        <template #mobileTopBadges>
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
            <!-- Search-match context (search mode only) -->
            <div
                v-if="highlight && (highlight.authorHtml || (highlight.snippetHtml && !hideBodySnippet))"
                data-test="search-match"
                class="flex flex-col gap-0.5 py-1 [&_mark]:rounded [&_mark]:bg-amber-200 [&_mark]:px-0"
            >
                <p v-if="highlight.authorHtml" class="text-xs text-zinc-500">
                    <span class="text-zinc-400">Author:</span>
                    <!-- eslint-disable-next-line vue/no-v-html (caller-escaped highlight HTML) -->
                    <span v-html="highlight.authorHtml"></span>
                </p>
                <!-- eslint-disable-next-line vue/no-v-html (caller-escaped highlight HTML) -->
                <p
                    v-if="highlight.snippetHtml && !hideBodySnippet"
                    class="line-clamp-2 text-xs text-zinc-500"
                    v-html="highlight.snippetHtml"
                ></p>
            </div>

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

        <template #mobileFooter>
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

        <template #desktopFooter>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge v-for="group in groups" :key="group._id" type="default" variant="blue">
                    {{ group.name }}
                </LBadge>
            </div>
        </template>
    </DisplayCard>
</template>
