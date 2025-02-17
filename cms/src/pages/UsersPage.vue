<script setup lang="ts">
import { db } from "luminary-shared";
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import LanguageTable from "@/components/languages/LanguageTable.vue";
</script>

<template>
    <BasePage title="Users overview">
        <template #actions>
            <div class="flex gap-4">
                <LButton
                    variant="primary"
                    :icon="PlusIcon"
                    @click="$router.push({ name: 'language', params: { id: db.uuid() } })"
                    name="createLanguageBtn"
                >
                    Create user
                </LButton>
            </div>
        </template>

        <LanguageTable />
    </BasePage>
</template>
