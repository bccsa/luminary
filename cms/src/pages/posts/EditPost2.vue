<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import EditContentParent from "@/components/content/EditContentParent.vue";
import LanguageSelector2 from "@/components/content/LanguageSelector2.vue";
import { db } from "@/db/baseDatabase";
import { useNotificationStore } from "@/stores/notification";
import {
    AclPermission,
    ContentStatus,
    DocType,
    type ContentDto,
    type LanguageDto,
    type PostDto,
    type Uuid,
} from "@/types";
import { DocumentIcon } from "@heroicons/vue/24/solid";
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import { useUserAccessStore } from "@/stores/userAccess";
import EditContentText from "@/components/content/EditContentText.vue";
import EditContentVideo from "@/components/content/EditContentVideo.vue";
import EditContentPreview from "@/components/content/EditContentPreview.vue";
import EditContentParentValidation from "@/components/content/EditContentParentValidation.vue";
import * as _ from "lodash";

const route = useRoute();
const { addNotification } = useNotificationStore();
const { verifyAccess } = useUserAccessStore();

const postId = route.params.id as Uuid;
const routeLanguage = route.params.language as string;
const docType = DocType.Post;

// Get a copy of the parent document from IndexedDB, and host it as a local ref.
// The initial ref is populated with an empty object and thereafter filled with the actual
// data retrieved from the database.
const parent = ref<PostDto>({
    _id: postId,
    type: DocType.Post,
    updatedTimeUtc: 0,
    memberOf: [],
    image: "",
    tags: [],
});
let parentPrev = ref<PostDto>(); // Previous version of the parent document for dirty check
db.get<PostDto>(postId).then((p) => {
    parent.value = p;
    parentPrev.value = _.cloneDeep(p);
});

// In the same way as the parent document, get a copy of the content documents
const contentDocs = ref<ContentDto[]>([]);
let contentDocsPrev = ref<ContentDto[]>(); // Previous version of the content documents for dirty check
db.whereParent<ContentDto[]>(postId, docType).then((doc) => {
    contentDocs.value.push(...doc);
    contentDocsPrev.value = _.cloneDeep(doc);
});

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const selectedLanguageId = ref<Uuid>();
const isLoading = computed(() => parent.value == undefined);

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

// Language and content selection
const selectedLanguage = computed(() => {
    return languages.value.find((l) => l._id == selectedLanguageId.value);
});

const selectedContent = computed(() => {
    if (contentDocs.value.length == 0) return undefined;
    return contentDocs.value.find((c) => c.language == selectedLanguageId.value);
});

const createTranslation = (language: LanguageDto) => {
    contentDocs.value.push({
        _id: db.uuid(),
        type: DocType.Content,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        parentId: parent.value._id,
        language: language._id,
        status: ContentStatus.Draft,
        title: `Translation for ${language.name}`,
        slug: "",
    });
    selectedLanguageId.value = language._id;
};

// Access control
const canTranslate = computed(() => {
    if (!parent.value || !selectedLanguage.value) return false;
    return (
        verifyAccess(parent.value.memberOf, docType, AclPermission.Translate) &&
        verifyAccess(selectedLanguage.value.memberOf, DocType.Language, AclPermission.Translate)
    );
});

// Dirty check and save
const isDirty = computed(
    () =>
        !_.isEqual(parent.value, parentPrev.value) ||
        !_.isEqual(contentDocs.value, contentDocsPrev.value),
);

const save = async () => {
    // Save the parent document
    await db.upsert(parent.value);

    // Save the content documents that changed
    const pList: Promise<any>[] = [];
    contentDocs.value.forEach((c) => {
        const prevContentDoc = contentDocsPrev.value?.find((d) => d._id == c._id);
        if (_.isEqual(c, prevContentDoc)) return;
        pList.push(db.upsert(c));
    });

    await Promise.all(pList);

    addNotification({
        title: "Post Saved",
        description: "The post was saved successfully",
        state: "success",
    });

    parentPrev.value = _.cloneDeep(parent.value);
    contentDocsPrev.value = _.cloneDeep(contentDocs.value);
};
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
                @createTranslation="createTranslation"
            />
        </template>
        <form type="post" class="relative grid grid-cols-3 gap-8" @submit.prevent>
            <!-- Main area -->
            <div class="col-span-3 space-y-6 md:col-span-2">
                <!-- Basic content settings -->
                <EditContentBasic
                    v-model:content="selectedContent"
                    :disabled="!canTranslate"
                    :validated="true"
                />
                <EditContentText v-model:content="selectedContent" :disabled="!canTranslate" />
                <EditContentVideo v-model:content="selectedContent" :disabled="!canTranslate" />
            </div>
            <!-- Sidebar -->
            <div class="col-span-3 md:col-span-1">
                <div class="sticky top-20 space-y-6">
                    <!-- Validation -->
                    <EditContentParentValidation
                        v-if="contentDocs"
                        v-model:parent="parent"
                        v-model:contentDocs="contentDocs"
                        :languages="languages"
                        @save="save"
                        :dirty="isDirty"
                    />
                    <!-- Live View -->
                    <EditContentPreview v-if="selectedContent" :content="selectedContent" />
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
