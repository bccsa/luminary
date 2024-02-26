<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import LSelect from "@/components/forms/LSelect.vue";
import { usePostStore } from "@/stores/post";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const postStore = usePostStore();

const postId = route.params.id as string;

const post = computed(() => postStore.post(postId));
const isLoading = computed(() => postStore.posts == undefined);
const content = computed(() => {
    return post.value?.content.find((c) => c.language.languageCode == selectedLanguage.value);
});

const languageOptions = [
    { label: "English", value: "eng" },
    { label: "Swahili", value: "swa" },
    { label: "Chichewa", value: "nya" },
    { label: "Español", value: "esp", disabled: true },
];
const selectedLanguage = ref("eng");
</script>

<template>
    <BasePage :title="content?.title" :loading="isLoading">
        <template #actions>
            <LSelect :options="languageOptions" v-model="selectedLanguage" />
        </template>

        <ContentForm :post="post" :content="content" v-if="content" @save="postStore.updatePost" />
    </BasePage>
</template>
