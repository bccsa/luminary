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
} from "@heroicons/vue/24/outline";
import {
    db,
    AclPermission,
    DocType,
    TagType,
    type LanguageDto,
    type Uuid,
    hasAnyPermission,
    type ContentDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import { debouncedWatch, onClickOutside } from "@vueuse/core";
import type { ContentOverviewQueryOptions } from "./query";
import LInput from "../forms/LInput.vue";
import { Menu } from "@headlessui/vue";
import LRadio from "../forms/LRadio.vue";
import LChecklist from "../forms/LChecklist.vue";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagType?: TagType;
};

const props = defineProps<Props>();

const tagType = Object.entries(TagType).some((t) => t[1] == props.tagType)
    ? props.tagType
    : undefined;

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const selectedLanguage = ref<Uuid>("");
const languageOptions = computed(() =>
    languages.value.map((l) => ({ value: l._id, label: l.name })),
);

const queryOptions = ref<ContentOverviewQueryOptions>({
    languageId: "",
    parentType: props.docType,
    tagType: tagType,
    translationStatus: "all",
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    pageSize: 20,
    pageIndex: 0,
    tags: [],
    search: "",
    publishStatus: "all",
});

const queryKey = computed(() => JSON.stringify(queryOptions.value));

watch(
    languages,
    () => {
        if (languages.value.length > 0 && !selectedLanguage.value) {
            selectedLanguage.value = languages.value[0]._id;
        }
    },
    { once: true },
);

watch(
    selectedLanguage,
    () => {
        queryOptions.value.languageId = selectedLanguage.value;
    },
    { immediate: true },
);

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Edit));

// Set the title
let tagTypeString: string = tagType as string;
if (!Object.entries(TagType).some((t) => t[1] == tagTypeString)) tagTypeString = "";

const titleType = tagTypeString ? tagTypeString : props.docType;
router.currentRoute.value.meta.title = `${capitaliseFirstLetter(titleType)} overview`;

const filterByTranslation = ref(queryOptions.value.translationStatus);
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

const filterByStatus = ref(queryOptions.value.publishStatus);
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

watch(filterByTranslation, () => {
    queryOptions.value.translationStatus = filterByTranslation.value;
});

watch(filterByStatus, () => {
    queryOptions.value.publishStatus = filterByStatus.value;
});

const searchTerm = ref("");

const sortOptionsAsRef = ref(undefined);

const showSortOptions = ref(false);

const selectedSortOption = ref("updatedTimeUtc");

debouncedWatch(
    searchTerm,
    () => {
        queryOptions.value.search = searchTerm.value;
    },
    { debounce: 500 },
);

watch(selectedSortOption, () => {
    queryOptions.value.orderBy = selectedSortOption.value as
        | "title"
        | "updatedTimeUtc"
        | "publishDate"
        | "expiryDate";
});

onClickOutside(sortOptionsAsRef, () => {
    showSortOptions.value = false;
});

const tags = db.whereTypeAsRef(DocType.Tag);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tagsToDisplay = ref<any[]>([]);
const tagsSelected = ref([]);
const tagsContent = ref<ContentDto[]>([]);
watch([tags, selectedLanguage], async () => {
    if (!tags.value || tags.value.length === 0) {
        return;
    }
    const tagIds = tags.value!.map((t) => t._id);

    tagsContent.value = await db.whereParent(tagIds, DocType.Tag, selectedLanguage.value);

    tagsContent.value.forEach((tagContent) => {
        const existingTagIndex = tagsToDisplay.value.findIndex(
            (tag) => tag.value === tagContent.parentId,
        );

        if (existingTagIndex === -1) {
            tagsToDisplay.value.push({
                label: tagContent.title,
                value: tagContent.parentId,
                isChecked: false,
            });
        } else {
            tagsToDisplay.value[existingTagIndex].label = tagContent.title;
        }
    });
});
watch(tagsSelected.value, () => {
    const tagValues = tagsSelected.value.map(
        (t: { label: string; value: string; isChecked: boolean }) => t.value.trim().toString(),
    );

    tagsSelected.value.forEach((t: { label: string; value: string; isChecked: boolean }) => {
        if (t.isChecked) {
            const index = tagsToDisplay.value.findIndex((tag) => tag.value === t.value);

            if (index > -1) {
                const [tagToMove] = tagsToDisplay.value.splice(index, 1);

                tagsToDisplay.value.unshift(tagToMove);
            }
        }
    });

    queryOptions.value.tags = [...tagValues];
});
</script>

<template>
    <BasePage :is-full-width="true" :title="`${capitaliseFirstLetter(titleType)} overview`">
        <template #actions>
            <div class="flex gap-4">
                <LSelect
                    v-model="selectedLanguage"
                    :options="languageOptions"
                    :required="true"
                    size="lg"
                    data-test="language-selector"
                />
                <LButton
                    :is="RouterLink"
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    :to="{
                        name: `edit`,
                        params: {
                            docType: docType,
                            tagType: tagType ? tagType.toString() : 'default',
                            id: 'new',
                        },
                    }"
                    data-test="create-button"
                >
                    Create {{ docType }}
                </LButton>
            </div>
        </template>
        <!-- TODO: Move empty state to ContentTable as the ContentOverview does not anymore know if there are content documents or not -->
        <!-- <EmptyState
            v-if="!contentParents || contentParents.length == 0"
            :icon="docType == DocType.Post ? DocumentIcon : TagIcon"
            :title="`No ${titleType}(s) yet`"
            :description="
                canCreateNew
                    ? `Get started by creating a new ${titleType}.`
                    : `You do not have permission to create a new ${titleType}.`
            "
            :buttonText="`Create ${titleType}`"
            :buttonLink="{
                name: `edit`,
                params: {
                    docType: docType,
                    tagType: tagType ? tagType.toString() : 'default',
                    id: 'new',
                },
            }"
            :buttonPermission="canCreateNew"
            data-test="no-content"
        /> -->
        <div class="flex w-full gap-1 rounded-t-md bg-white p-2 shadow-lg">
            <LInput
                v-model="searchTerm"
                type="text"
                :icon="MagnifyingGlassIcon"
                class="flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                :full-height="true"
            />

            <div class="">
                <div class="relative flex gap-1">
                    <LSelect
                        v-model="filterByTranslation"
                        data-test="filter-select"
                        :options="filterByTranslationOptions"
                        :icon="LanguageIcon"
                    />
                    <LSelect
                        v-model="filterByStatus"
                        data-test="filter-select"
                        :options="filterByStatusOptions"
                        :icon="CloudArrowUpIcon"
                    />
                    <LChecklist
                        v-model="tagsSelected"
                        :options="tagsToDisplay"
                        :searchable="true"
                        :icon="TagIcon"
                        placeholder="Search tags..."
                        @clear-selected-values="queryOptions.tags = []"
                    />
                    <LButton data-test="sort-toggle-btn" @click="() => (showSortOptions = true)">
                        <ArrowsUpDownIcon class="h-full w-4" />
                    </LButton>
                    <Menu
                        v-if="showSortOptions"
                        ref="sortOptionsAsRef"
                        as="div"
                        class="absolute right-0 top-full mt-[2px] h-max w-40 rounded-lg bg-white p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                        data-test="sort-options-display"
                    >
                        <div class="flex flex-col">
                            <LRadio
                                v-model="selectedSortOption"
                                label="Title"
                                value="title"
                                data-test="sort-option-title"
                            />
                            <LRadio
                                v-model="selectedSortOption"
                                label="Expiry Date"
                                value="expiryDate"
                                data-test="sort-option-expiry-date"
                            />
                            <LRadio
                                v-model="selectedSortOption"
                                label="Publish Date"
                                value="publishDate"
                                data-test="sort-option-publish-date"
                            />
                            <LRadio
                                v-model="selectedSortOption"
                                label="Last Updated"
                                value="updatedTimeUtc"
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
                </div>
            </div>
        </div>

        <ContentTable
            v-if="selectedLanguage"
            :key="queryKey"
            :doc-type="docType"
            :tag-type="tagType"
            :language-id="selectedLanguage"
            :query-options="queryOptions"
            data-test="content-table"
        />
    </BasePage>
</template>
