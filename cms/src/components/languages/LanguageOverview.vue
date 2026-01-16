<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import GenericFilterBar from "@/components/common/GenericFilter/GenericFilterBar.vue";
import type {
    GenericFilterConfig,
    GenericQueryOptions,
} from "@/components/common/GenericFilter/types";
import { genericQuery } from "@/utils/genericQuery";
import LanguageDisplayCard from "@/components/languages/LanguageDisplayCard.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { AclPermission, db, DocType, hasAnyPermission, type LanguageDto } from "luminary-shared";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));

const createNew = () => {
    router.push({ name: "language", params: { id: db.uuid() } });
};

// GenericFilter configuration
const languageFilterConfig: GenericFilterConfig<LanguageDto> = {
    fields: ["name", "updatedTimeUtc"],
    defaultOrderBy: "updatedTimeUtc",
    defaultOrderDirection: "desc",
    pageSize: 20,
};

// Initialize query options
const queryOptions = ref<GenericQueryOptions<LanguageDto>>({
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    pageSize: 20,
    pageIndex: 0,
    search: "",
});

// Use the generic query function for data
const languages = genericQuery<LanguageDto>(
    {
        docType: DocType.Language,
        searchableFields: ["name"],
    },
    queryOptions,
);
</script>

<template>
    <BasePage title="Language overview" :should-show-page-title="false" :is-full-width="true">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="$router.push({ name: 'language', params: { id: db.uuid() } })"
                    name="createLanguageBtn"
                >
                    Create language
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-6 w-6 text-zinc-500"
                    @click="createNew"
                />
            </div>
        </template>

        <template #internalPageHeader>
            <GenericFilterBar
                :config="languageFilterConfig"
                v-model:query-options="queryOptions"
                :is-small-screen="isSmallScreen"
            />
        </template>

        <LanguageDisplayCard
            v-for="language in languages?.docs ?? []"
            :key="language._id"
            :languagesDoc="language"
        />
    </BasePage>
</template>
