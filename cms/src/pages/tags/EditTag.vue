<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";
import { useTagStore } from "@/stores/tag";
import type { Language } from "@/types";
import { computed, onBeforeMount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const tagStore = useTagStore();

const tagId = route.params.id as string;
const routeLanguage = route.params.language as string;

const tag = computed(() => tagStore.tag(tagId));
const isLoading = computed(() => tag.value == undefined);
const content = computed(() => {
    return tag.value?.content.find((c) => c.language.languageCode == selectedLanguage.value);
});

const selectedLanguage = ref<string>();

onBeforeMount(() => {
    if (routeLanguage) {
        selectedLanguage.value = routeLanguage;

        router.replace({ name: "tags.edit", params: { tagId } });
    }
});

watch(
    tag,
    (tag) => {
        if (!tag || tag.content.length == 0 || routeLanguage || selectedLanguage.value) {
            return;
        }

        // TODO this needs to come from a profile setting
        const defaultLanguage = "eng";

        const defaultLanguageContent = tag.content.find(
            (c) => c.language.languageCode == defaultLanguage,
        );
        if (defaultLanguageContent) {
            selectedLanguage.value = defaultLanguage;
            return;
        }

        selectedLanguage.value = tag.content[0].language.languageCode;
    },
    { immediate: true },
);

async function createTranslation(language: Language) {
    await tagStore.createTranslation(tag.value!, language);

    selectedLanguage.value = language.languageCode;
}
</script>

<template>
    <BasePage
        :title="content ? content.title : 'Edit tag'"
        :loading="isLoading"
        :back-link-location="{ name: 'tags.categories' }"
        back-link-text="Categories"
    >
        <template #actions>
            <LanguageSelector
                v-if="content"
                :parent="tag"
                v-model="selectedLanguage"
                @create-translation="createTranslation"
            />
        </template>

        <EmptyState
            v-if="!content"
            title="No translations found"
            description="This tag does not have any translations. Click to get started:"
        >
            <LanguageSelector
                :parent="tag"
                v-model="selectedLanguage"
                @create-translation="createTranslation"
            />
        </EmptyState>

        <transition
            enter-active-class="transition ease duration-500"
            enter-from-class="opacity-0 scale-90"
            enter-to-class="opacity-100 scale-100"
        >
            <ContentForm
                v-if="content && tag"
                :key="content._id"
                :parent="tag"
                :content="content"
                @save="tagStore.updateTag"
            />
        </transition>
    </BasePage>
</template>
