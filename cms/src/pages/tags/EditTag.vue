<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import EditContentForm from "@/components/content/EditContentForm.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";
import { useContentStore } from "@/stores/content";
import { useTagStore } from "@/stores/tag";
import { TagType, type Language } from "@/types";
import { TagIcon } from "@heroicons/vue/24/solid";
import { computed, onBeforeMount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const backLinkMap = {
    [TagType.Category]: {
        link: "tags.categories",
        text: "Categories",
    },
    [TagType.Topic]: {
        link: "tags.topics",
        text: "Topics",
    },
    [TagType.AudioPlaylist]: {
        link: "tags.audio-playlists",
        text: "Audio playlists",
    },
};

const route = useRoute();
const router = useRouter();
const tagStore = useTagStore();
const contentStore = useContentStore();

const tagId = route.params.id as string;
const routeLanguage = route.params.language as string;

const tag = computed(() => tagStore.tag(tagId));
const content = computed(() => {
    if (tag.value && tag.value.content.length > 0) {
        return tag.value.content.find((c) => c.language.languageCode == selectedLanguage.value);
    }

    return contentStore.singleContent(tagId, selectedLanguage.value ?? "eng");
});
const isLoading = computed(() => tag.value == undefined);

const backLink = computed(() => {
    if (!tag.value) {
        return backLinkMap[TagType.Category];
    }

    return backLinkMap[tag.value.tagType];
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
        :icon="TagIcon"
        :loading="isLoading"
        :back-link-location="{ name: backLink.link }"
        :back-link-text="backLink.text"
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
            <EditContentForm
                v-if="content && tag"
                :key="content._id"
                :parent="tag"
                :content="content"
                ruleset="tag"
                @save="tagStore.updateTag"
            />
        </transition>
    </BasePage>
</template>
