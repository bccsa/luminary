<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import OAuthProviderOverview from "@/components/oAuthProvider/OAuthProviderOverview.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { ref } from "vue";
import { isSmallScreen } from "@/globalConfig";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";

const overviewRef = ref<InstanceType<typeof OAuthProviderOverview> | null>(null);
const canEdit = hasAnyPermission(DocType.OAuthProvider, AclPermission.Edit);

const createNew = () => {
    overviewRef.value?.openCreateModal();
};
</script>

<template>
    <BasePage title="OAuth Providers" :should-show-page-title="true">
        <template #pageNav>
            <div class="flex gap-4">
                <LButton
                    v-if="!isSmallScreen && canEdit"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="createNew"
                    name="createProviderBtn"
                >
                    Add Provider
                </LButton>
                <PlusIcon
                    v-else-if="isSmallScreen && canEdit"
                    class="h-6 w-6 text-zinc-500"
                    @click="createNew"
                />
            </div>
        </template>

        <div class="space-y-1">
            <div>
                <p class="text-gray-600">
                    Manage OAuth provider configurations for authentication.
                </p>
            </div>

            <OAuthProviderOverview ref="overviewRef" />
        </div>
    </BasePage>
</template>
