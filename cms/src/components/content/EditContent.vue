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
    TagType,
    type ContentDto,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type Uuid,
} from "@/types";
import { DocumentIcon } from "@heroicons/vue/24/solid";
import { computed, ref, watch } from "vue";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import { useUserAccessStore } from "@/stores/userAccess";
import EditContentText from "@/components/content/EditContentText.vue";
import EditContentVideo from "@/components/content/EditContentVideo.vue";
import EditContentPreview from "@/components/content/EditContentPreview.vue";
import EditContentParentValidation from "@/components/content/EditContentParentValidation.vue";
import _ from "lodash";
import router from "@/router";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    parentId: Uuid;
    languageCode?: string;
    docType: DocType.Post | DocType.Tag;
    tagType?: keyof TagType;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();
const { verifyAccess } = useUserAccessStore();

// Refs
// The initial ref is populated with an empty object and thereafter filled with the actual
// data retrieved from the database.
const parent = ref<PostDto | TagDto>({
    _id: props.parentId,
    type: props.docType,
    updatedTimeUtc: 0,
    memberOf: [],
    image: "",
    tags: [],
});
const isLoading = computed(() => parent.value == undefined);
const selectedLanguageId = ref<Uuid>();
const parentPrev = ref<PostDto | TagDto>(); // Previous version of the parent document for dirty check
const contentDocs = ref<ContentDto[]>([]);
const contentDocsPrev = ref<ContentDto[]>(); // Previous version of the content documents for dirty check

// Set the title
let tagTypeString: string = props.tagType as string;
if (!Object.entries(TagType).some((t) => t[1] == tagTypeString)) tagTypeString = "";

const titleType = tagTypeString ? tagTypeString : props.docType;
router.currentRoute.value.meta.title = `Edit ${titleType}`;

// Get a copy of the parent document from IndexedDB, and host it as a local ref.
db.get<PostDto | TagDto>(props.parentId).then((p) => {
    parent.value = p;
    parentPrev.value = _.cloneDeep(p);
});

// In the same way as the parent document, get a copy of the content documents
db.whereParent<ContentDto[]>(props.parentId, props.docType).then((doc) => {
    contentDocs.value.push(...doc);
    contentDocsPrev.value = _.cloneDeep(doc);
});

// Languages and language selection
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

watch(
    languages,
    () => {
        // Get list of content languages
        const contentLanguages = contentDocs.value
            .map((c) => c.language)
            .filter((l) => {
                // Check if the language is in the list of languages
                return languages.value.find((lang) => lang._id == l);
            });

        if (props.languageCode) {
            const preferred = contentLanguages.find((l) => l == props.languageCode);

            if (preferred) {
                selectedLanguageId.value = preferred;
                return;
            }
        }

        if (contentLanguages.length > 0) {
            selectedLanguageId.value = contentLanguages[0];
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
        parentType: props.docType,
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
        verifyAccess(parent.value.memberOf, props.docType, AclPermission.Translate) &&
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
        title: `${capitaliseFirstLetter(titleType)} saved`,
        description: `The ${titleType} was saved successfully`,
        state: "success",
    });

    parentPrev.value = _.cloneDeep(parent.value);
    contentDocsPrev.value = _.cloneDeep(contentDocs.value);
};
</script>

<template>
    <BasePage
        :title="selectedContent ? selectedContent.title : `Edit ${titleType}`"
        :icon="DocumentIcon"
        :loading="isLoading"
        :backLinkLocation="{ name: 'overview' }"
        :backLinkText="`${capitaliseFirstLetter(titleType)} overview`"
        :backLinkParams="{
            docType: docType,
            tagType: tagType ? tagType.toString() : undefined,
            parentId: parent._id,
            languageCode: languageCode,
        }"
        v-if="parent"
    >
        <template #actions>
            <LanguageSelector2
                :parent="parent"
                :content="contentDocs"
                :languages="languages"
                v-model="selectedLanguageId"
                @createTranslation="createTranslation"
            />
        </template>
        <div class="relative grid grid-cols-3 gap-8">
            <!-- Main area -->
            <div class="col-span-3 space-y-6 md:col-span-2" v-if="selectedContent">
                <!-- Basic content settings -->
                <EditContentBasic v-model:content="selectedContent" :disabled="!canTranslate" />
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
                        :docType="props.docType"
                        :language="selectedLanguage"
                        v-model="parent"
                    />
                </div>
            </div>
        </div>
    </BasePage>
</template>
