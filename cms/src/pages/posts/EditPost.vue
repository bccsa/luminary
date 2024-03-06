<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";
import { usePostStore } from "@/stores/post";
import type { Content, Language } from "@/types";
import { computed, ref, toRaw, watch } from "vue";
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

async function createTranslation(language: Language) {
    await postStore.createTranslation(post.value!, language);

    selectedLanguage.value = language.languageCode;
}
</script>

<template>
    <BasePage :title="content?.title" :loading="isLoading">
        <template #actions>
            <LanguageSelector
                :post="post"
                v-model="selectedLanguage"
                @create-translation="createTranslation"
            />
        </template>

        <transition
            enter-active-class="transition ease duration-500"
            enter-from-class="opacity-0 scale-90"
            enter-to-class="opacity-100 scale-100"
        >
            <ContentForm
                v-if="content"
                :key="content._id"
                :post="post"
                :content="content"
                @save="postStore.updatePost"
            />
        </transition>
    </BasePage>
</template>
