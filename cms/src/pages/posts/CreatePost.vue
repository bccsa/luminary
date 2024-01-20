<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import PostForm from "@/components/posts/PostForm.vue";
import AcButton from "@/components/forms/AcButton.vue";
</script>

<template>
    <BasePage title="Create Post" sticky>
        <template #actions>
            <div class="flex gap-4">
                <AcButton variant="secondary">Save as draft</AcButton>
                <AcButton disabled>Publish</AcButton>
            </div>
        </template>

        <PostForm />
    </BasePage>
</template>
