<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageDisplayCard from "@/components/languages/LanguageDisplayCard.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { AclPermission, db, DocType, hasAnyPermission, type LanguageDto } from "luminary-shared";
import { computed } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const createNew = () => {
    router.push({ name: "language", params: { id: db.uuid() } });
};
</script>

<template>
    <BasePage title="Language overview" :should-show-page-title="false" :is-full-width="true">
        <template #pageNav>
            <div
                v-if="canCreateNew"
                role="button"
                tabindex="0"
                data-testid="create-language-btn"
                class="flex gap-4 cursor-pointer"
                @click="createNew"
                @keydown.enter.prevent="createNew"
                @keydown.space.prevent="createNew"
            >
                <LButton
                    v-if="!isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    name="createLanguageBtn"
                >
                    Create language
                </LButton>
                <PlusIcon
                    v-else-if="isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
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
