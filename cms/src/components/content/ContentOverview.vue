<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import {
    PlusIcon,
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    ArrowPathIcon,
    XMarkIcon,
} from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";
import {
    db,
    AclPermission,
    DocType,
    TagType,
    type LanguageDto,
    type Uuid,
    hasAnyPermission,
} from "luminary-shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LSelect from "../forms/LSelect.vue";
import LInput from "../forms/LInput.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import type { ContentOverviewQueryOptions } from "./query";
import { onClickOutside } from "@vueuse/core";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagType?: TagType;
};

type Filter = "type" | "status" | "translation" | undefined;

interface FilterInput {
    id: string;
    filter: string;
    by: Filter;
}

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
const filterInput = ref<string>("");

const filters = ref<FilterInput[]>([]);

const showSortOptions = ref(false);

const sortOptionsRef = ref(null);

const filterBtnRef = ref(null);
const filterInputRef = ref(null);

const sortOption = ref<"title" | "updatedTimeUtc" | "publishDate" | "expiryDate" | undefined>(
    undefined,
);

const handleResetSorting = () => {
    searchTerm.value = "";
    queryOptions.value.search = "";
    queryOptions.value.orderBy = undefined;
};
const handleSortByTitle = () => (queryOptions.value.orderBy = "title");
const handleSortByUpdated = () => (queryOptions.value.orderBy = "updatedTimeUtc");
const handleSortAscending = () => (queryOptions.value.orderDirection = "asc");
const handleSortDescending = () => (queryOptions.value.orderDirection = "desc");

const handleSearch = () => {
    queryOptions.value.search = searchTerm.value;
    searchTerm.value = "";
};

const handleNewFilter = (event: Event) => {
    const target = event.target as HTMLElement;
    target.classList.add("hidden");

    const filterInput = document.getElementById("filterInput");
    filterInput?.classList.remove("hidden");
    filterInput?.focus();
};

const handleAddNewFilter = () => {
    const filterBtn = document.getElementById("addFilterBtn");
    const filterInputEl = document.getElementById("filterInput");

    if (filterInput.value) {
        const input = filterInput.value.trim();
        const newInput = input.split(":");

        const newId =
            filters.value.length > 0
                ? (Math.max(...filters.value.map((f) => parseInt(f.id))) + 1).toString()
                : "1";

        const newFilter: FilterInput = {
            id: newId,
            filter: newInput[0],
            by: newInput[1] as Filter,
        };

        filterInput.value = "";
        filters.value.push(newFilter);
    }

    filterBtn?.classList.remove("hidden");
    filterInputEl?.classList.add("hidden");
};

const handleFilterDelete = async (event: Event) => {
    const element = event.target as HTMLElement;

    if (element.tagName === "BUTTON") {
        const idToDelete = element.id;
        console.log("Id to delete:", idToDelete);
        const currentFilters = [...filters.value];
        filters.value = currentFilters.filter((val) => {
            console.log("Checking filter with ID:", val.id);
            if (val.filter == "translation") queryOptions.value.translationStatus = "all";
            else if (val.filter == "type") queryOptions.value.tagType = tagType;
            else if (val.filter == "status") queryOptions.value.publishStatus = "all";
            return idToDelete !== val.id;
        });

        await nextTick();
    }

    console.log(filters.value);
};

const handleDeleteAllFilters = () => {
    filters.value = [];
    queryOptions.value.publishStatus = "all";
    queryOptions.value.translationStatus = "all";
    queryOptions.value.tagType = tagType;
};

watch(sortOption, () => {
    queryOptions.value.orderBy = sortOption.value;
});

watch(filters.value, () => {
    console.log("filters changed");
    filters.value.map((filter) => {
        if (filter.filter == "translation") {
            console.log(`Filter ${filter.filter} by ${filter.by}`);
            queryOptions.value.translationStatus = filter.by as
                | "all"
                | "translated"
                | "untranslated"
                | undefined;
        } else if (filter.filter == "type") {
            console.log(`Filter ${filter.filter} by ${filter.by}`);
            queryOptions.value.tagType = filter.by as TagType;
        } else if (filter.filter == "tag") {
            queryOptions.value.tags?.push(filter.by as string);
        } else if (filter.filter == "status") {
            console.log(`Filter ${filter.filter} by ${filter.by}`);
            queryOptions.value.publishStatus = filter.by as
                | "all"
                | "published"
                | "scheduled"
                | "expired"
                | "draft"
                | undefined;
        }
    });
});

onClickOutside(sortOptionsRef, () => {
    showSortOptions.value = false;
});

onClickOutside(filterInputRef, () => {
    const filterBtn = document.getElementById("addFilterBtn");
    const filterInput = document.getElementById("filterInput");

    filterBtn?.classList.remove("hidden");
    filterInput?.classList.add("hidden");
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
        <div class="shadow-md">
            <div
                class="flex h-12 justify-between gap-2 rounded-t-lg border-[1px] bg-white p-[0.25rem] pl-2"
            >
                <input
                    type="text"
                    class="h-full w-3/4 border-none p-4 focus:border-none focus:bg-zinc-200 focus:outline-none focus:ring-0"
                    name="search"
                    placeholder="Search..."
                    v-model="searchTerm"
                    @keydown.enter="handleSearch"
                />
                <div>
                    <div class="relative flex h-full gap-1">
                        <button
                            class="flex w-10 justify-center rounded-md border-[1px] focus:border-2 focus:border-black focus:outline-none"
                            @click="handleResetSorting"
                        >
                            <ArrowPathIcon class="h-full w-4" />
                        </button>
                        <button
                            class="flex h-full w-10 flex-row content-center justify-center rounded-md border-[1px] focus:border-2 focus:border-black focus:outline-none"
                            @click="() => (showSortOptions = true)"
                        >
                            <ArrowsUpDownIcon class="h-full w-4" />
                        </button>
                        <div
                            ref="sortOptionsRef"
                            class="absolute right-0 top-full mt-2 h-max w-40 rounded-lg border border-gray-300 bg-white p-2 shadow-lg"
                            v-if="showSortOptions"
                        >
                            <h4>Sort By:</h4>
                            <div class="flex flex-col">
                                <label>
                                    <input
                                        class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                        type="radio"
                                        name="sortOption"
                                        value="title"
                                        v-model="sortOption"
                                    />
                                    Title
                                </label>
                                <label>
                                    <input
                                        class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                        type="radio"
                                        name="sortOption"
                                        value="expiryDate"
                                        v-model="sortOption"
                                    />
                                    Expiry Date
                                </label>
                                <label>
                                    <input
                                        class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                        type="radio"
                                        name="sortOption"
                                        value="publishDate"
                                        v-model="sortOption"
                                    />
                                    Publish Date
                                </label>
                                <label>
                                    <input
                                        class="ml-2 text-zinc-800 focus:border-0 focus:outline-none focus:ring-0"
                                        type="radio"
                                        name="sortOption"
                                        value="updatedTimeUtc"
                                        v-model="sortOption"
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
            <!--Filter Row -->
            <div class="flex h-max w-full flex-wrap content-center gap-1 bg-white p-2 px-4">
                <button
                    v-for="filter in filters"
                    :key="filter.id"
                    :id="filter.id"
                    @click="handleFilterDelete"
                    class="flex w-max flex-row content-center justify-center gap-1 rounded-xl border-[1px] p-1 px-2"
                    title="Delete filter"
                >
                    {{ filter.filter }}:{{ filter.by }}
                </button>
                <button
                    id="addFilterBtn"
                    ref="filterBtnRef"
                    class="flex w-32 flex-row content-center justify-center gap-1 rounded-xl border-[1px] p-1 px-2"
                    @click="handleNewFilter"
                >
                    Add Filter
                </button>
                <button
                    class="flex w-10 justify-center rounded-md border-[1px] focus:border-2 focus:border-black focus:outline-none"
                    @click="handleDeleteAllFilters"
                    title="Delete all filters"
                >
                    <XMarkIcon class="h-full w-4" />
                </button>
                <input
                    ref="filterInputRef"
                    id="filterInput"
                    class="hidden h-5 w-32 self-center border-none focus:ring-0"
                    @keydown.enter="handleAddNewFilter"
                    v-model="filterInput"
                />
            </div>
        </div>

        <ContentTable
            @sort-by-title="handleSortByTitle"
            @sort-by-updated="handleSortByUpdated"
            v-if="selectedLanguage"
            :docType="docType"
            :tagType="tagType"
            :languageId="selectedLanguage"
            :key="queryKey"
            :queryOptions="queryOptions"
        />
    </BasePage>
</template>
