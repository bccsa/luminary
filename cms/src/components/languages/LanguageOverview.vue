<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageDisplayCard from "@/components/languages/LanguageDisplayCard.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    useSharedHybridQueryWithState,
    type LanguageDto,
} from "luminary-shared";
import { computed } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));

// `isFetching` settles to false when the read completes even with no languages; a fires-once watch
// on the output would hang on an empty result (HybridQuery dedupes [] → []).
const {
    output: languages,
    isFetching: isLoading,
    hasLocalChanges,
} = useSharedHybridQueryWithState<LanguageDto>(() => ({ selector: { type: DocType.Language } }), {
    live: true,
});

const createNew = () => {
    router.push({ name: "language", params: { id: db.uuid() } });
};
</script>

<template>
    <BasePage
        title="Language overview"
        :should-show-page-title="false"
        :is-full-width="true"
        :loading="isLoading"
    >
        <template #topBarActionsDesktop>
            <LButton
                v-if="canCreateNew && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="$router.push({ name: 'language', params: { id: db.uuid() } })"
                name="createLanguageBtn"
            >
                Create language
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <PlusIcon
                v-if="canCreateNew && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="createNew"
            />
        </template>
        <div class="mt-1 flex flex-col gap-[3px]">
            <LanguageDisplayCard
                v-for="language in languages"
                :key="language._id"
                :languagesDoc="language"
                :has-local-changes="hasLocalChanges"
            />
        </div>
    </BasePage>
</template>
