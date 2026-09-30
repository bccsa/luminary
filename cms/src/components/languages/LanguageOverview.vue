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
import EmptyState from "@/components/EmptyState.vue";

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

const hasAnyContent = computed(() => languages.value.length > 0);

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
                v-if="canCreateNew && hasAnyContent && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="$router.push({ name: 'language', params: { id: db.uuid() } })"
                name="createLanguageBtn"
            >
                Create language
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <LButton
                v-if="canCreateNew && hasAnyContent && isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="createNew"
                name="createLanguageBtn"
            >
                Create language
            </LButton>
        </template>
        <div class="flex flex-col gap-[3px]">
            <EmptyState
                v-if="!isLoading && !hasAnyContent"
                title="No languages yet"
                description="Add a language to start creating translated content."
                :button-text="canCreateNew ? 'Create language' : undefined"
                :button-action="canCreateNew ? createNew : undefined"
                :button-permission="canCreateNew"
                name="createLanguageBtn"
                show-back-button
            />
            <LanguageDisplayCard
                v-for="language in languages"
                :key="language._id"
                :languagesDoc="language"
                :has-local-changes="hasLocalChanges"
            />
        </div>
    </BasePage>
</template>
