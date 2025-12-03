<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageDisplayCard from "@/components/languages/LanguageDisplayCard.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { AclPermission, db, DocType, hasAnyPermission } from "luminary-shared";
import { computed } from "vue";
import LButton from "../button/LButton.vue";
import { isSmallScreen } from "@/globalConfig";
import router from "@/router";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));

const createNew = () => {
    router.push({ name: "language", params: { id: db.uuid() } });
};
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

        <LanguageDisplayCard />
    </BasePage>
</template>
