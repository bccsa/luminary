<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import LModal from "@/components/modals/LModal.vue";
import LBadge from "@/components/common/LBadge.vue";
import LInput from "@/components/forms/LInput.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LButton from "@/components/button/LButton.vue";
import LTag from "@/components/content/LTag.vue";
import {
    MagnifyingGlassIcon,
    LanguageIcon,
    DocumentDuplicateIcon,
    ExclamationTriangleIcon,
    ArrowUturnLeftIcon,
} from "@heroicons/vue/24/outline";
import { CheckCircleIcon, XCircleIcon, DocumentTextIcon, TagIcon } from "@heroicons/vue/20/solid";
import { DocType, type LanguageDto, type PostType, type TagType } from "luminary-shared";
import { isMobileScreen } from "@/globalConfig";

export type ParentTranslationStatus = {
    parentId: string;
    title: string;
    parentType?: DocType;
    parentPostType?: PostType;
    parentTagType?: TagType;
    translatedLanguages: Set<string>;
    translated: number;
    total: number;
};

type TypeFilter = "all" | "post" | "tag";
type TranslationStatus = "all" | "translated" | "untranslated";

type Props = {
    parents: ParentTranslationStatus[];
    languages: LanguageDto[];
    currentLanguageId: string;
    parentRoute: (p: ParentTranslationStatus) => RouteLocationRaw | undefined;
};

const props = defineProps<Props>();
const isVisible = defineModel<boolean>("isVisible");
const router = useRouter();

const search = ref("");
const typeFilter = ref<TypeFilter>("all");
const translationStatus = ref<TranslationStatus>("untranslated");
const missingInLangs = ref<Array<string | number>>([]);

const typeOptions = [
    { value: "all", label: "All types" },
    { value: "post", label: "Posts" },
    { value: "tag", label: "Tags" },
];

const translationStatusOptions = [
    { value: "all", label: "All" },
    { value: "translated", label: "Fully translated" },
    { value: "untranslated", label: "Has missing translations" },
];

const reset = () => {
    search.value = "";
    typeFilter.value = "all";
    translationStatus.value = "untranslated";
    missingInLangs.value = [];
};

watch(isVisible, (v) => {
    if (v) reset();
});

const removeMissingIn = (langId: string | number) => {
    missingInLangs.value = missingInLangs.value.filter((id) => id !== langId);
};

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    return props.parents
        .filter((p) => {
            if (q && !p.title.toLowerCase().includes(q)) return false;
            if (typeFilter.value === "post" && p.parentType !== DocType.Post) return false;
            if (typeFilter.value === "tag" && p.parentType !== DocType.Tag) return false;
            if (translationStatus.value === "translated" && p.translated < p.total) return false;
            if (translationStatus.value === "untranslated" && p.translated >= p.total) return false;
            for (const langId of missingInLangs.value) {
                if (p.translatedLanguages.has(langId as string)) return false;
            }
            return true;
        })
        .sort((a, b) => a.translated - b.translated || a.title.localeCompare(b.title));
});

const languageOptions = computed(() =>
    props.languages.map((lang) => ({
        id: lang._id,
        label: lang.name,
        value: lang._id,
    })),
);

const onRowClick = (item: ParentTranslationStatus) => {
    const route = props.parentRoute(item);
    if (!route) return;
    isVisible.value = false;
    router.push(route);
};
</script>

<template>
    <LModal
        heading="Translation coverage"
        largeModal
        stickToEdges
        v-model:is-visible="isVisible"
    >
        <div class="flex min-h-0 flex-1 flex-col gap-2 pt-3">
            <div class="flex flex-col gap-1 overflow-visible">
                <div class="flex flex-wrap items-center gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="min-w-[12rem] flex-grow"
                        name="search"
                        placeholder="Search..."
                        data-test="search-input"
                        v-model="search"
                        :full-height="true"
                    />

                    <LSelect
                        data-test="filter-translation-status"
                        v-model="translationStatus"
                        :options="translationStatusOptions"
                        :icon="LanguageIcon"
                    />

                    <LSelect
                        data-test="filter-type"
                        v-model="typeFilter"
                        :options="typeOptions"
                        :icon="DocumentDuplicateIcon"
                    />

                    <LCombobox
                        :options="languageOptions"
                        v-model:selected-options="missingInLangs"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="false"
                        :icon="ExclamationTriangleIcon"
                        placeholder="Missing in..."
                    />

                    <LButton @click="reset()" class="w-10">
                        <ArrowUturnLeftIcon class="h-4 w-4" />
                    </LButton>
                </div>

                <div v-if="missingInLangs.length > 0" class="flex w-full flex-wrap gap-2">
                    <LTag
                        :icon="ExclamationTriangleIcon"
                        v-for="langId in missingInLangs"
                        :key="langId"
                        @remove="removeMissingIn(langId)"
                    >
                        Missing in {{ languages.find((l) => l._id === langId)?.name }}
                    </LTag>
                </div>
            </div>

            <!-- Mobile card list -->
            <ul
                v-if="isMobileScreen"
                class="min-h-0 flex-1 space-y-2 overflow-auto pr-0.5"
            >
                <li
                    v-if="filtered.length === 0"
                    class="py-8 text-center text-sm text-zinc-400"
                >
                    No items match the current filters.
                </li>
                <li
                    v-for="item in filtered"
                    :key="item.parentId"
                    class="group cursor-pointer rounded-md border border-zinc-200 bg-white p-3 active:bg-zinc-100"
                    @click="onRowClick(item)"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex min-w-0 items-center gap-1.5">
                            <DocumentTextIcon
                                v-if="item.parentType === DocType.Post"
                                class="h-4 w-4 shrink-0 text-zinc-400"
                            />
                            <TagIcon
                                v-else-if="item.parentType === DocType.Tag"
                                class="h-4 w-4 shrink-0 text-zinc-400"
                            />
                            <span
                                class="truncate text-sm font-medium text-zinc-900"
                                :class="parentRoute(item) ? 'group-active:text-yellow-600' : ''"
                            >
                                {{ item.title || "Untitled" }}
                            </span>
                        </div>
                        <LBadge
                            :variant="
                                item.translated >= item.total
                                    ? 'success'
                                    : item.translated === 0
                                      ? 'error'
                                      : 'warning'
                            "
                            paddingY="py-0.5"
                            paddingX="px-1.5"
                        >
                            {{ item.translated }}/{{ item.total }}
                        </LBadge>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1">
                        <span
                            v-for="lang in languages"
                            :key="lang._id"
                            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide"
                            :class="
                                item.translatedLanguages.has(lang._id)
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-zinc-100 text-zinc-400'
                            "
                            :title="lang.name"
                        >
                            <CheckCircleIcon
                                v-if="item.translatedLanguages.has(lang._id)"
                                class="h-3 w-3"
                            />
                            <XCircleIcon v-else class="h-3 w-3" />
                            {{ lang.languageCode }}
                        </span>
                    </div>
                </li>
            </ul>

            <!-- Desktop table -->
            <div
                v-else
                class="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-200"
            >
                <table class="w-full text-left text-sm">
                    <thead
                        class="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"
                    >
                        <tr>
                            <th class="px-3 py-2 font-medium">Title</th>
                            <th class="px-2 py-2 font-medium">Type</th>
                            <th
                                v-for="lang in languages"
                                :key="lang._id"
                                class="px-2 py-2 text-center font-medium"
                                :title="lang.name"
                            >
                                {{ lang.languageCode }}
                            </th>
                            <th class="px-3 py-2 text-right font-medium">Coverage</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-100">
                        <tr v-if="filtered.length === 0">
                            <td
                                :colspan="3 + languages.length"
                                class="py-8 text-center text-sm text-zinc-400"
                            >
                                No items match the current filters.
                            </td>
                        </tr>
                        <tr
                            v-for="item in filtered"
                            :key="item.parentId"
                            class="group cursor-pointer hover:bg-zinc-50"
                            @click="onRowClick(item)"
                        >
                            <td class="min-w-[16rem] px-3 py-2">
                                <span
                                    class="text-zinc-900"
                                    :class="
                                        parentRoute(item) ? 'group-hover:text-yellow-600' : ''
                                    "
                                >
                                    {{ item.title || "Untitled" }}
                                </span>
                            </td>
                            <td class="px-2 py-2 text-zinc-500">
                                <DocumentTextIcon
                                    v-if="item.parentType === DocType.Post"
                                    class="h-4 w-4"
                                />
                                <TagIcon
                                    v-else-if="item.parentType === DocType.Tag"
                                    class="h-4 w-4"
                                />
                            </td>
                            <td
                                v-for="lang in languages"
                                :key="lang._id"
                                class="px-2 py-2 text-center"
                            >
                                <CheckCircleIcon
                                    v-if="item.translatedLanguages.has(lang._id)"
                                    class="mx-auto h-4 w-4 text-emerald-500"
                                />
                                <XCircleIcon v-else class="mx-auto h-4 w-4 text-zinc-300" />
                            </td>
                            <td class="px-3 py-2 text-right">
                                <LBadge
                                    :variant="
                                        item.translated >= item.total
                                            ? 'success'
                                            : item.translated === 0
                                              ? 'error'
                                              : 'warning'
                                    "
                                    paddingY="py-0.5"
                                    paddingX="px-1.5"
                                >
                                    {{ item.translated }}/{{ item.total }}
                                </LBadge>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="text-xs text-zinc-500">
                Showing {{ filtered.length }} of {{ parents.length }}
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end">
                <LButton variant="secondary" @click="isVisible = false">Close</LButton>
            </div>
        </template>
    </LModal>
</template>
