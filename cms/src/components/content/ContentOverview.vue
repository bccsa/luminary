<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon, FunnelIcon } from "@heroicons/vue/20/solid";
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
import { computed, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
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

const showFilterOptions = ref(false);

const filterByTranslation = ref(queryOptions.value.translationStatus);
const filterByTranslationOptions = [
    {
        value: "translated",
        label: "Translated Documents",
    },
    {
        value: "untranslated",
        label: "Untranslated Documents",
    },
    {
        value: "all",
        label: "All Documents",
    },
];

const filterByStatus = ref(queryOptions.value.publishStatus);
const filterByStatusOptions = [
    {
        value: "published",
        label: "Published Documents",
    },
    {
        value: "scheduled",
        label: "Scheduled Documents",
    },
    {
        value: "expired",
        label: "Expired Documents",
    },
    {
        value: "draft",
        label: "Drafted Documents",
    },
    {
        value: "all",
        label: "All Documents",
    },
];

watch(filterByTranslation, () => {
    queryOptions.value.translationStatus = filterByTranslation.value as
        | "all"
        | "translated"
        | "untranslated"
        | undefined;
});

watch(filterByStatus, () => {
    queryOptions.value.publishStatus = filterByStatus.value as
        | "all"
        | "published"
        | "scheduled"
        | "expired"
        | "draft"
        | undefined;
});

const handleShowFilterOptions = () => {
    showFilterOptions.value = !showFilterOptions.value;
};
</script>

<template>
    <BasePage :title="`${capitaliseFirstLetter(titleType)} overview`">
        <template #actions>
            <div class="flex gap-4">
                <button
                    @click="handleShowFilterOptions"
                    class="rounded-md border-[1px] p-2 px-3"
                    data-test="show-filter-options-btn"
                >
                    <FunnelIcon class="w-4" />
                </button>
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
        <div
            data-test="filter-options"
            class="my-2 h-max rounded-md bg-zinc-200 p-4"
            v-if="showFilterOptions"
        >
            <h2
                data-test="filter-options-title"
                class="my-2 rounded-md bg-zinc-800 p-1 text-center text-zinc-50"
            >
                Filter Items
            </h2>
            <div class="flex gap-5">
                <label data-test="filter-label"
                    >Translation
                    <LSelect
                        data-test="filter-select"
                        v-model="filterByTranslation"
                        :options="filterByTranslationOptions"
                    />
                </label>

                <label data-test="filter-label">
                    Status
                    <LSelect
                        data-test="filter-select"
                        v-model="filterByStatus"
                        :options="filterByStatusOptions"
                    />
                </label>
            </div>
        </div>

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
