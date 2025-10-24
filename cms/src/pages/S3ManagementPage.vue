<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import S3BucketOverview from "@/components/s3/S3BucketOverview.vue";
</script>

<template>
    <BasePage title="S3 Storage Management" :should-show-page-title="true">
        <div class="space-y-6">
            <div>
                <p class="text-gray-600">
                    Manage S3 bucket configurations for file storage and uploads.
                </p>
            </div>

            <!-- S3 Bucket Overview Component -->
            <S3BucketOverview />
        </div>
    </BasePage>
</template>
