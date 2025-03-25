<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon, LanguageIcon, CloudArrowUpIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    TagIcon,
    ArrowUturnLeftIcon,
} from "@heroicons/vue/24/outline";
import {
    db,
    AclPermission,
    DocType,
    TagType,
    type Uuid,
    hasAnyPermission,
    type ContentDto,
    PostType,
    useDexieLiveQueryWithDeps,
    type LanguageDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LSelect from "../../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import { debouncedWatch, onClickOutside } from "@vueuse/core";
import type { ContentOverviewQueryOptions } from "../query";
import LInput from "../../forms/LInput.vue";
import { Menu } from "@headlessui/vue";
import LRadio from "../../forms/LRadio.vue";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import LChecklist from "@/components/forms/LChecklist.vue";
import LTag from "../LTag.vue";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
};

const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const languageOptions = computed(() =>
    languages.value.map((l) => ({ value: l._id, label: l.name })),
);

const savedQueryOptions = sessionStorage.getItem(
    `queryOptions_${props.docType}_${props.tagOrPostType}`,
);
const queryOptions = ref<ContentOverviewQueryOptions>(
    savedQueryOptions
        ? JSON.parse(savedQueryOptions)
        : {
              languageId: "",
              parentType: props.docType,
              tagOrPostType: props.tagOrPostType,
              translationStatus: "all",
              orderBy: "updatedTimeUtc",
              orderDirection: "desc",
              pageSize: 20,
              pageIndex: 0,
              tags: [],
              search: "",
              publishStatus: "all",
          },
);

watch(
    queryOptions,
    () => {
        sessionStorage.setItem(
            `queryOptions_${props.docType}_${props.tagOrPostType}`,
            JSON.stringify(queryOptions.value),
        );
    },
    { deep: true },
);

watch(
    [cmsLanguageIdAsRef],
    () => {
        queryOptions.value.languageId = cmsLanguageIdAsRef.value;
    },
    { immediate: true },
);

const tableRefreshKey = computed(() => JSON.stringify(queryOptions.value));

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Edit));

router.currentRoute.value.meta.title = `${capitaliseFirstLetter(props.tagOrPostType)} overview`;

const filterByTranslationOptions = [
    {
        value: "translated",
        label: "Translated",
    },
    {
        value: "untranslated",
        label: "Untranslated",
    },
    {
        value: "all",
        label: "All",
    },
];

const filterByStatusOptions = [
    {
        value: "published",
        label: "Published",
    },
    {
        value: "scheduled",
        label: "Scheduled",
    },
    {
        value: "expired",
        label: "Expired",
    },
    {
        value: "draft",
        label: "Draft",
    },
    {
        value: "all",
        label: "All",
    },
];

const sortOptionsMenu = ref(undefined);
const showSortOptions = ref(false);

const debouncedSearchTerm = ref(queryOptions.value.search);
debouncedWatch(
    debouncedSearchTerm,
    () => {
        queryOptions.value.search = debouncedSearchTerm.value;
    },
    { debounce: 500 },
);

onClickOutside(sortOptionsMenu, () => {
    showSortOptions.value = false;
});

const tagContentDocs = useDexieLiveQueryWithDeps(
    cmsLanguageIdAsRef,
    (_cmsLanguageIdAsRef: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                parentType: DocType.Tag,
                language: _cmsLanguageIdAsRef,
            })
            .sortBy("title") as unknown as Promise<ContentDto[]>,
    { initialValue: [] as ContentDto[] },
);

const resetQueryOptions = () => {
    queryOptions.value = {
        languageId: queryOptions.value.languageId,
        parentType: queryOptions.value.parentType,
        tagOrPostType: queryOptions.value.tagOrPostType,
        translationStatus: "all",
        orderBy: "updatedTimeUtc",
        orderDirection: "desc",
        pageSize: 20,
        pageIndex: 0,
        tags: [],
        search: "",
        publishStatus: "all",
    };

    debouncedSearchTerm.value = "";
};
</script>

<template>
    <BasePage :is-full-width="true" :title="`${capitaliseFirstLetter(tagOrPostType)} overview`">
        <template #actions>
            <div class="flex gap-4">
                <LSelect
                    v-model="cmsLanguageIdAsRef"
                    :options="languageOptions"
                    :required="true"
                    size="lg"
                    data-test="language-selector"
                />
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    :is="RouterLink"
                    :to="{
                        name: `edit`,
                        params: {
                            docType: docType,
                            tagOrPostType: tagOrPostType,
                            id: 'new',
                        },
                    }"
                    data-test="create-button"
                >
                    Create {{ docType }}
                </LButton>
            </div>
        </template>
        <div class="flex w-full gap-1 rounded-t-md bg-white p-2 shadow">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="debouncedSearchTerm"
                :full-height="true"
            />

            <div class="">
                <div class="relative flex gap-1">
                    <LSelect
                        data-test="filter-select"
                        v-model="queryOptions.translationStatus"
                        :options="filterByTranslationOptions"
                        :icon="LanguageIcon"
                    />
                    <LSelect
                        data-test="filter-select"
                        v-model="queryOptions.publishStatus"
                        :options="filterByStatusOptions"
                        :icon="CloudArrowUpIcon"
                    />
                    <LChecklist
                        :options="
                            tagContentDocs.map((tag) => ({
                                label: tag.title,
                                value: tag.parentId,
                            }))
                        "
                        :icon="TagIcon"
                        v-model:selectedValues="queryOptions.tags"
                        :is-content-overview="true"
                    />

                    <LButton @click="() => (showSortOptions = true)" data-test="sort-toggle-btn">
                        <ArrowsUpDownIcon class="h-full w-4" />
                    </LButton>
                    <Menu
                        as="div"
                        ref="sortOptionsMenu"
                        class="absolute right-0 top-full mt-[2px] h-max w-40 rounded-lg bg-white p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                        v-if="showSortOptions"
                        data-test="sort-options-display"
                    >
                        <div class="flex flex-col">
                            <LRadio
                                label="Title"
                                value="title"
                                v-model="queryOptions.orderBy"
                                data-test="sort-option-title"
                            />
                            <LRadio
                                label="Expiry Date"
                                value="expiryDate"
                                v-model="queryOptions.orderBy"
                                data-test="sort-option-expiry-date"
                            />
                            <LRadio
                                label="Publish Date"
                                value="publishDate"
                                v-model="queryOptions.orderBy"
                                data-test="sort-option-publish-date"
                            />
                            <LRadio
                                label="Last Updated"
                                value="updatedTimeUtc"
                                v-model="queryOptions.orderBy"
                                data-test="sort-option-last-updated"
                            />
                        </div>
                        <hr class="my-2" />
                        <div class="flex flex-col gap-1">
                            <LButton
                                class="flex justify-stretch"
                                data-test="ascending-sort-toggle"
                                :class="
                                    queryOptions.orderDirection == 'asc'
                                        ? 'bg-zinc-100'
                                        : 'bg-white'
                                "
                                :icon="ArrowUpIcon"
                                @click="queryOptions.orderDirection = 'asc'"
                                >Ascending</LButton
                            >
                            <LButton
                                class="flex justify-stretch"
                                data-test="descending-sort-toggle"
                                :class="
                                    queryOptions.orderDirection == 'desc'
                                        ? 'bg-zinc-100'
                                        : 'bg-white'
                                "
                                variant="secondary"
                                :icon="ArrowDownIcon"
                                @click="queryOptions.orderDirection = 'desc'"
                                >Descending</LButton
                            >
                        </div>
                    </Menu>
                    <LButton @click="resetQueryOptions" class="w-10">
                        <ArrowUturnLeftIcon class="h-4 w-4" />
                    </LButton>
                </div>
            </div>
        </div>
        <div
            v-if="queryOptions.tags && queryOptions.tags?.length > 0"
            class="w-full bg-white px-2 pb-2 shadow"
        >
            <ul class="flex w-full flex-wrap gap-2">
                <TransitionGroup
                    enter-active-class="transition duration-150 delay-75"
                    enter-from-class="transform scale-90 opacity-0"
                    enter-to-class="transform scale-100 opacity-100"
                    leave-active-class="transition duration-100"
                    leave-from-class="transform scale-100 opacity-100"
                    leave-to-class="transform scale-90 opacity-0"
                >
                    <LTag
                        v-for="tag in queryOptions.tags"
                        :key="tag"
                        @remove="
                            () => {
                                if (!queryOptions.tags) return;
                                queryOptions.tags = queryOptions.tags.filter((v) => v != tag);
                            }
                        "
                    >
                        {{ tagContentDocs.find((t) => t.parentId == tag)?.title }}
                    </LTag>
                </TransitionGroup>
            </ul>
        </div>
        <ContentTable
            v-if="cmsLanguageIdAsRef"
            :key="tableRefreshKey"
            :queryOptions="queryOptions"
            data-test="content-table"
        />
    </BasePage>
</template>
