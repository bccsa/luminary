<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import S3BucketOverview from "@/components/s3/StorageOverview.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { ref } from "vue";
import { isSmallScreen } from "@/globalConfig";
import { AclPermission, DocType, hasAnyPermission } from "luminary-shared";

const bucketOverviewRef = ref<InstanceType<typeof S3BucketOverview> | null>(null);
const canEdit = hasAnyPermission(DocType.Storage, AclPermission.Edit);

const createNew = () => {
    bucketOverviewRef.value?.openCreateModal();
};
</script>

<template>
    <BasePage title="S3 Storage Overview" :should-show-page-title="true">
        <template #topBarActionsDesktop>
            <LButton
                v-if="!isSmallScreen && canEdit"
                variant="primary"
                :icon="PlusIcon"
                @click="createNew"
                name="createBucketBtn"
                class="w-auto shrink-0 whitespace-nowrap px-4 py-2 text-sm"
            >
                Add Bucket
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <LButton
                v-if="isSmallScreen && canEdit"
                variant="primary"
                :icon="PlusIcon"
                @click="createNew"
                name="createBucketBtn"
                class="w-auto shrink-0 whitespace-nowrap px-4 py-2 text-sm"
            >
                Add Bucket
            </LButton>
        </template>

        <div class="space-y-1">
            <div>
                <p class="dark:text-zinc-100">
                    Manage S3 bucket configurations for file storage and uploads.
                </p>
            </div>

            <!-- S3 Bucket Overview Component -->
            <S3BucketOverview ref="bucketOverviewRef" />
        </div>
    </BasePage>
</template>
