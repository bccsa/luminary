<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import EditContentForm from "@/components/content/EditContentForm.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";
import { useContentStore } from "@/stores/content";
import { usePostStore } from "@/stores/post";
import type { Language } from "@/types";
import { DocumentIcon } from "@heroicons/vue/24/solid";
import { computed, onBeforeMount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const postStore = usePostStore();
const contentStore = useContentStore();

const postId = route.params.id as string;
const routeLanguage = route.params.language as string;

const post = computed(() => postStore.post(postId));
const content = computed(() => {
    if (post.value && post.value.content.length > 0) {
        return post.value.content.find((c) => c.language.languageCode == selectedLanguage.value);
    }

    return contentStore.singleContent(postId, selectedLanguage.value ?? "eng");
});
const isLoading = computed(() => post.value == undefined);

const selectedLanguage = ref<string>();

onBeforeMount(() => {
    if (routeLanguage) {
        selectedLanguage.value = routeLanguage;

        router.replace({ name: "posts.edit", params: { id: postId } });
    }
});

watch(
    post,
    (post) => {
        if (!post || post.content.length == 0 || routeLanguage || selectedLanguage.value) {
            return;
        }

        // TODO this needs to come from a profile setting
        const defaultLanguage = "eng";

        const defaultLanguageContent = post.content.find(
            (c) => c.language.languageCode == defaultLanguage,
        );
        if (defaultLanguageContent) {
            selectedLanguage.value = defaultLanguage;
            return;
        }

        selectedLanguage.value = post.content[0].language.languageCode;
    },
    { immediate: true },
);

async function createTranslation(language: Language) {
    await postStore.createTranslation(post.value!, language);

    selectedLanguage.value = language.languageCode;
}
</script>

<template>
    <BasePage
        :title="content ? content.title : 'Edit post'"
        :icon="DocumentIcon"
        :loading="isLoading"
        :back-link-location="{ name: 'posts.index' }"
        back-link-text="Posts"
    >
        <template #actions>
            <LanguageSelector
                v-if="content"
                :parent="post"
                v-model="selectedLanguage"
                @create-translation="createTranslation"
            />
        </template>

        <EmptyState
            v-if="!content"
            title="No translations found"
            description="This post does not have any translations. Click to get started:"
        >
            <LanguageSelector
                :parent="post"
                v-model="selectedLanguage"
                @create-translation="createTranslation"
            />
        </EmptyState>

        <transition
            enter-active-class="transition ease duration-500"
            enter-from-class="opacity-0 scale-90"
            enter-to-class="opacity-100 scale-100"
        >
            <EditContentForm
                v-if="content && post"
                :key="content._id"
                :parent="post"
                :content="content"
                ruleset="post"
                @save="postStore.updatePost"
            />
        </transition>
    </BasePage>
</template>
