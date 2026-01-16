<script setup lang="ts">
import { AclPermission, DocType, hasAnyPermission, type RedirectDto } from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectTable from "./RedirectTable.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { computed, ref, watch } from "vue";
import LButton from "../button/LButton.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
import GenericFilterBar from "@/components/common/GenericFilter/GenericFilterBar.vue";
import type {
    GenericFilterConfig,
    GenericQueryOptions,
} from "@/components/common/GenericFilter/types";
import { isSmallScreen } from "@/globalConfig";
import LPaginator from "@/components/common/LPaginator.vue";

const canCreateNew = computed(() => hasAnyPermission(DocType.Redirect, AclPermission.Edit));
const isModalVisible = ref(false);

// Redirect Filter Configuration - Shorthand Mode!
const redirectFilterConfig: GenericFilterConfig<RedirectDto> = {
    fields: ["slug", "toSlug", "redirectType"], // Auto-searchable and sortable
    defaultOrderBy: "slug",
    defaultOrderDirection: "asc",
    pageSize: 20,
};

type RedirectQueryOptions = GenericQueryOptions<RedirectDto>;

const defaultQueryOptions: RedirectQueryOptions = {
    search: "",
    orderBy: "slug",
    orderDirection: "asc",
    pageSize: 20,
    pageIndex: 0,
};

const savedQueryOptions = () => sessionStorage.getItem("redirectOverviewQueryOptions");

function mergeNewFields(saved: string | null): RedirectQueryOptions {
    const parsed = saved ? JSON.parse(saved) : {};
    return {
        ...defaultQueryOptions,
        ...parsed,
        pageSize: parsed.pageSize ?? 20,
        pageIndex: parsed.pageIndex ?? 0,
    };
}

const queryOptions = ref<RedirectQueryOptions>(
    mergeNewFields(savedQueryOptions()) as RedirectQueryOptions,
);

watch(
    queryOptions,
    () => {
        sessionStorage.setItem("redirectOverviewQueryOptions", JSON.stringify(queryOptions.value));
    },
    { deep: true },
);

// Reset to first page when search changes
watch([() => queryOptions.value.search], () => {
    queryOptions.value.pageIndex = 0;
});

const totalRedirects = ref(0);
</script>

<template>
    <BasePage title="Redirects" :is-full-width="true">
        <template #actions>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isModalVisible = true"
                    name="createRedirectBtn"
                >
                    Create redirect
                </LButton>
            </div>
        </template>

        <template #internalPageHeader>
            <GenericFilterBar
                :config="redirectFilterConfig"
                :is-small-screen="isSmallScreen"
                v-model:query-options="queryOptions"
            />
        </template>

        <RedirectTable :query-options="queryOptions" @update:total="totalRedirects = $event" />

        <template #footer>
            <div class="w-full sm:px-8">
                <LPaginator
                    :amountOfDocs="totalRedirects"
                    v-model:index="queryOptions.pageIndex as number"
                    v-model:page-size="queryOptions.pageSize as number"
                    variant="extended"
                />
            </div>
        </template>

        <CreateOrEditRedirectModal
            v-if="isModalVisible"
            :isVisible="isModalVisible"
            @close="isModalVisible = false"
        />
    </BasePage>
</template>
