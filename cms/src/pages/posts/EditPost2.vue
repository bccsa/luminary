<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import EditContentParent from "@/components/content/EditContentParent.vue";
import LanguageSelector2 from "@/components/content/LanguageSelector2.vue";
import { db } from "@/db/baseDatabase";
import { useNotificationStore } from "@/stores/notification";
import {
    AclPermission,
    DocType,
    type ContentDto,
    type LanguageDto,
    type PostDto,
    type Uuid,
} from "@/types";
import { DocumentIcon } from "@heroicons/vue/24/solid";
import { computed, onBeforeMount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import { useUserAccessStore } from "@/stores/userAccess";
import EditContentText from "@/components/content/EditContentText.vue";
import EditContentVideo from "@/components/content/EditContentVideo.vue";

const route = useRoute();
const router = useRouter();
const { addNotification } = useNotificationStore();
const { verifyAccess } = useUserAccessStore();

const postId = route.params.id as Uuid;
const routeLanguage = route.params.language as string;
const docType = DocType.Post;

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

// Access control
const canTranslate = computed(() => {
    if (!parent || !parent.value || !selectedLanguage.value) return false;
    return (
        verifyAccess(parent.value.memberOf, docType, AclPermission.Translate) &&
        verifyAccess(selectedLanguage.value.memberOf, DocType.Language, AclPermission.Translate)
    );
});
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
        <form type="post" class="relative grid grid-cols-3 gap-8" @submit.prevent>
            <!-- Main area -->
            <div class="col-span-3 space-y-6 md:col-span-2">
                <!-- Basic content settings -->
                <EditContentBasic v-model:content="selectedContent" :disabled="!canTranslate" />
                <EditContentText v-model:content="selectedContent" :disabled="!canTranslate" />
                <EditContentVideo v-model:content="selectedContent" :disabled="!canTranslate" />
            </div>
            <!-- Sidebar -->
            <div class="col-span-3 md:col-span-1">
                <div class="sticky top-20 space-y-6">
                    <!-- Parent settings -->
                    <EditContentParent
                        v-if="parent"
                        :docType="DocType.Post"
                        :language="selectedLanguage"
                        v-model="parent"
                    />
                </div>
            </div>
        </form>
    </BasePage>
</template>
