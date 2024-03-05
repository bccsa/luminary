<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import LSelect from "@/components/forms/LSelect.vue";
import { useLanguageStore } from "@/stores/language";
import { usePostStore } from "@/stores/post";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const postStore = usePostStore();
const { languages } = storeToRefs(useLanguageStore());

const postId = route.params.postId as string;
const language = route.params.language as string;

const post = computed(() => postStore.post(postId));
const isLoading = computed(() => postStore.posts == undefined);
const content = computed(() => {
    return post.value?.content.find((c) => c.language.languageCode == selectedLanguage.value);
});

const languageOptions = computed(() => {
    if (!languages.value) {
        return [];
    }

    return languages.value.map((language) => {
        return {
            label: language.name,
            value: language.languageCode,
        };
    });
});
const selectedLanguage = ref("eng");

if (language) {
    selectedLanguage.value = language;

    router.replace({ name: "posts.edit", params: { postId } });
}
</script>

<template>
    <BasePage :title="content?.title" :loading="isLoading">
        <template #actions>
            <LSelect :options="languageOptions" v-model="selectedLanguage" />
        </template>

        <ContentForm :post="post" :content="content" v-if="content" @save="postStore.updatePost" />
    </BasePage>
</template>
