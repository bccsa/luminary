<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LanguageTable from "@/components/languages/LanguageTable.vue";
import LButton from "../button/LButton.vue";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";
import { computed } from "vue";
import { PlusIcon } from "@heroicons/vue/24/outline";

const canCreateNew = computed(() => hasAnyPermission(DocType.Language, AclPermission.Edit));
</script>

<template>
    <BasePage title="Language overview">
        <template #actions>
            <div class="flex gap-4">
                <LButton v-if="canCreateNew" variant="primary" :icon="PlusIcon">
                    Create Language
                </LButton>
            </div>
        </template>

        <LanguageTable />
    </BasePage>
</template>
