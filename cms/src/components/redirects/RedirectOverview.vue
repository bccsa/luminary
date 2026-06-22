<script setup lang="ts">
import {
    AclPermission,
    DocType,
    hasAnyPermission,
    type RedirectDto,
    useHybridQueryWithState,
} from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectDisplaycard from "./RedirectDisplaycard.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
import { isSmallScreen } from "@/globalConfig";
import { useInfiniteScrollList } from "@/composables/useInfiniteScrollList";

const canCreateNew = computed(() => hasAnyPermission(DocType.Redirect, AclPermission.Edit));
const isCreateOrEditModalVisible = ref(false);

// `isFetching` settles to false when the read completes even with no redirects; a fires-once watch
// on the output would hang on an empty result (HybridQuery dedupes [] → []).
const { output: redirects, isFetching: isLoading } = useHybridQueryWithState<RedirectDto>(
    () => ({
        selector: { type: DocType.Redirect },
        $sort: [{ updatedTimeUtc: "desc" }],
    }),
    { live: true },
);

const { visible: visibleRedirects } = useInfiniteScrollList(redirects, { pageSize: 20 });
</script>

<template>
    <BasePage title="Redirects" :should-show-page-title="false" :loading="isLoading">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="isCreateOrEditModalVisible = true"
                    name="createLanguageBtn"
                >
                    Create redirect
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="isCreateOrEditModalVisible = true"
                />
            </div>
        </template>

        <RedirectDisplaycard
            v-for="redirect in visibleRedirects"
            :key="redirect._id"
            :redirectDoc="redirect"
        />

        <CreateOrEditRedirectModal
            v-if="isCreateOrEditModalVisible"
            :isVisible="isCreateOrEditModalVisible"
            @close="isCreateOrEditModalVisible = false"
        />
    </BasePage>
</template>
