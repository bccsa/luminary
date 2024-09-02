<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";
import { ArrowsUpDownIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/vue/24/outline";
import {
    db,
    AclPermission,
    DocType,
    TagType,
    type LanguageDto,
    type Uuid,
    hasAnyPermission,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import { onClickOutside } from "@vueuse/core";
import type { ContentOverviewQueryOptions } from "./query";

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

const searchTerm = ref("");

const sortOptionsAsRef = ref(null);

const showSortOptions = ref(false);

const selectedSortOption = ref("updatedTimeUtc");

watch(searchTerm, () => {
    setTimeout(() => {
        queryOptions.value.search = searchTerm.value;
    }, 500);
});

watch(selectedSortOption, () => {
    queryOptions.value.orderBy = selectedSortOption.value as
        | "title"
        | "updatedTimeUtc"
        | "publishDate"
        | "expiryDate";
});

const handleSortAscending = () => {
    queryOptions.value.orderDirection = "asc";
};

const handleSortDescending = () => {
    queryOptions.value.orderDirection = "desc";
};

onClickOutside(sortOptionsAsRef, () => {
    showSortOptions.value = false;
});
</script>

<template>
    <BasePage :title="`${capitaliseFirstLetter(titleType)} overview`">
        <template #actions>
            <div class="flex gap-4">
                <LSelect
                    v-model="selectedLanguage"
                    :options="languageOptions"
                    :required="true"
                    size="lg"
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
        <div class="flex h-14 w-full justify-between rounded-t-md bg-white p-2 shadow-lg">
            <input
                type="text"
                class="h-full w-3/4 rounded-md border-none p-4 focus:border-none focus:bg-zinc-200 focus:outline-none focus:ring-0"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="searchTerm"
            />
            <div>
                <div class="relative flex h-full gap-1">
                    <button
                        class="flex h-full w-10 flex-row content-center justify-center rounded-md border-[1px] focus:border-2 focus:border-black focus:outline-none"
                        @click="() => (showSortOptions = true)"
                        data-test="sort-toggle-btn"
                    >
                        <ArrowsUpDownIcon class="h-full w-4" />
                    </button>
                    <div
                        ref="sortOptionsAsRef"
                        class="absolute right-0 top-full mt-2 h-max w-40 rounded-lg border border-gray-300 bg-white p-2 shadow-lg"
                        v-if="showSortOptions"
                        data-test="sort-options-display"
                    >
                        <h4>Sort By:</h4>
                        <div class="flex flex-col">
                            <label>
                                <input
                                    class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                    type="radio"
                                    name="sortOption"
                                    value="title"
                                    v-model="selectedSortOption"
                                    data-test="sort-option-title"
                                />
                                Title
                            </label>
                            <label>
                                <input
                                    class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                    type="radio"
                                    name="sortOption"
                                    value="expiryDate"
                                    v-model="selectedSortOption"
                                    data-test="sort-option-expiry-date"
                                />
                                Expiry Date
                            </label>
                            <label>
                                <input
                                    class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                    type="radio"
                                    name="sortOption"
                                    value="publishDate"
                                    v-model="selectedSortOption"
                                    data-test="sort-option-publish-date"
                                />
                                Publish Date
                            </label>
                            <label>
                                <input
                                    class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                    type="radio"
                                    name="sortOption"
                                    value="updatedTimeUtc"
                                    v-model="selectedSortOption"
                                    data-test="sort-option-last-updated"
                                />
                                Last Updated
                            </label>
                        </div>
                        <hr class="my-2" />
                        <div class="flex flex-col gap-1">
                            <button
                                @click="handleSortAscending"
                                class="flex w-full gap-1 rounded-md p-2 text-zinc-950 hover:bg-zinc-300"
                            >
                                <ArrowUpIcon class="w-6" /> Ascending
                            </button>
                            <button
                                class="flex w-full gap-1 rounded-md p-2 hover:bg-zinc-300"
                                @click="handleSortDescending"
                            >
                                <ArrowDownIcon class="w-6" /> Descending
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <ContentTable
            v-if="selectedLanguage"
            :docType="docType"
            :tagType="tagType"
            :languageId="selectedLanguage"
            :key="queryKey"
            :queryOptions="queryOptions"
        />
    </BasePage>
</template>
