<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageDisplayCard from "@/components/languages/LanguageDisplayCard.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    queryLocal,
    type LanguageDto,
} from "luminary-shared";
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import { useDocsByType } from "@/composables/useDocsByType";
import router from "@/router";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));
const languages = useDocsByType<LanguageDto>(DocType.Language);

// `languages` is a SHARED useDocsByType ref that may already be populated (globalConfig creates the
// Language query at startup), so a fires-once watch wouldn't re-fire on mount. Resolve loading off a
// one-shot local read instead — settles regardless of whether the result is empty or pre-loaded.
const isLoading = ref(true);
queryLocal<LanguageDto>({ selector: { type: DocType.Language } }).finally(() => {
    isLoading.value = false;
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
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="createNew"
                />
            </div>
        </template>
        <LanguageDisplayCard
            v-for="language in languages"
            :key="language._id"
            :languagesDoc="language"
        />
    </BasePage>
</template>
