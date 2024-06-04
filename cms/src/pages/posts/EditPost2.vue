<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import EditContentCommon from "@/components/content/EditContentCommon.vue";
import EditContentForm from "@/components/content/EditContentForm.vue";
import EditContentForm2 from "@/components/content/EditContentForm2.vue";
import LanguageSelector2 from "@/components/content/LanguageSelector2.vue";
import { db } from "@/db/baseDatabase";
import { useContentStore } from "@/stores/content";
import { useNotificationStore } from "@/stores/notification";
import { usePostStore } from "@/stores/post";
import {
    DocType,
    type ContentDto,
    type Language,
    type LanguageDto,
    type PostDto,
    type Uuid,
} from "@/types";
import { DocumentIcon } from "@heroicons/vue/24/solid";
import { computed, onBeforeMount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const { addNotification } = useNotificationStore();

const postId = route.params.id as Uuid;
const routeLanguage = route.params.language as string;

const parent = db.getAsRef<PostDto>(postId, {
    _id: postId,
    type: DocType.Post,
    updatedTimeUtc: 0,
    memberOf: [],
    image: "",
    tags: [],
});

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const contentDocs = db.whereParentAsRef<ContentDto[]>(postId, DocType.Post, []);
const selectedLanguageId = ref<Uuid>();

watch(
    languages,
    () => {
        if (routeLanguage) {
            const preferred = languages.value.find((l) => l.languageCode == routeLanguage);

            if (preferred) {
                selectedLanguageId.value = preferred._id;
                return;
            }
        }

        if (languages.value.length > 0) {
            selectedLanguageId.value = languages.value[0]._id;
            return;
        }
    },
    { once: true },
);

const selectedLanguage = computed(() => {
    return languages.value.find((l) => l._id == selectedLanguageId.value);
});

const selectedContent = computed(() => {
    if (contentDocs.value.length == 0) return undefined;
    return contentDocs.value.find((c) => c.language == selectedLanguageId.value);
});

const isLoading = computed(() => parent.value == undefined);
</script>

<template>
    <BasePage
        :title="selectedContent ? selectedContent.title : 'Edit post'"
        :icon="DocumentIcon"
        :loading="isLoading"
        :back-link-location="{ name: 'posts.index' }"
        back-link-text="Posts"
    >
        <template #actions>
            <LanguageSelector2
                v-if="parent"
                :parent="parent"
                :content="contentDocs"
                :languages="languages"
                v-model="selectedLanguageId"
            />
        </template>
        {{ selectedContent?.title }}
        <EditContentCommon
            v-if="parent"
            :docType="DocType.Post"
            :language="selectedLanguage"
            v-model="parent"
        />
    </BasePage>
</template>
