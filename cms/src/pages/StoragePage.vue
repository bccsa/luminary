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
        <template #pageNav>
            <div class="flex gap-4">
                <LButton
                    v-if="!isSmallScreen && canEdit"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="createNew"
                    name="createBucketBtn"
                >
                    Add Bucket
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
                    Manage S3 bucket configurations for file storage and uploads.
                </p>
            </div>

            <!-- S3 Bucket Overview Component -->
            <S3BucketOverview ref="bucketOverviewRef" />
        </div>
    </BasePage>
</template>
