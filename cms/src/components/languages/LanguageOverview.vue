<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageTable from "@/components/languages/LanguageTable.vue";
import LButton from "@/components/button/LButton.vue";
import { AclPermission, db, DocType, hasAnyPermission } from "luminary-shared";
import { computed, ref } from "vue";
import { PlusIcon } from "@heroicons/vue/24/outline";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));
</script>

<template>
    <BasePage title="Language overview">
        <template #actions>
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
