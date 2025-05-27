<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageTable from "@/components/languages/LanguageTable.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { AclPermission, db, DocType, hasAnyPermission } from "luminary-shared";
import { computed } from "vue";
import LButton from "../button/LButton.vue";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));
</script>

<template>
    <BasePage title="Language overview" :should-show-page-title="false" :is-full-width="true">
        <template #pageNav>
            <div class="flex gap-4" v-if="canCreateNew">
                <LButton
                    v-if="canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="$router.push({ name: 'language', params: { id: db.uuid() } })"
                    name="createLanguageBtn"
                >
                    Create language
                </LButton>
            </div>
        </template>

        <LanguageTable />
    </BasePage>
</template>
