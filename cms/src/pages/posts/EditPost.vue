<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";
import { usePostStore } from "@/stores/post";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const postStore = usePostStore();

const postId = route.params.postId as string;
const language = route.params.language as string;

const post = computed(() => postStore.post(postId));
const isLoading = computed(() => postStore.posts == undefined);
const content = computed(() => {
    return post.value?.content.find((c) => c.language.languageCode == selectedLanguage.value);
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
            <LanguageSelector :post="post" v-model="selectedLanguage" />
        </template>

        <ContentForm :post="post" :content="content" v-if="content" @save="postStore.updatePost" />
    </BasePage>
</template>
