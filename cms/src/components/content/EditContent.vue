<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LDialog from "@/components/common/LDialog.vue";
import EditContentParent from "@/components/content/EditContentParent.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";
import { useNotificationStore } from "@/stores/notification";
import {
    db,
    AclPermission,
    PublishStatus,
    DocType,
    TagType,
    type ContentDto,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type Uuid,
    verifyAccess,
    type ContentParentDto,
    PostType,
    isConnected,
} from "luminary-shared";
import {
    DocumentIcon,
    TagIcon,
    FolderArrowDownIcon,
    ArrowUturnLeftIcon,
    TrashIcon,
} from "@heroicons/vue/24/solid";
import { computed, ref, watch } from "vue";
import EditContentStatus from "@/components/content/EditContentStatus.vue";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import EditContentText from "@/components/content/EditContentText.vue";
import EditContentVideo from "@/components/content/EditContentVideo.vue";
import EditContentParentValidation from "@/components/content/EditContentParentValidation.vue";
import EmptyState from "@/components/EmptyState.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import * as _ from "lodash";
import router from "@/router";
import { capitaliseFirstLetter } from "@/util/string";
import { sortByName } from "@/util/sortByName";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
import { clientAppUrl } from "@/globalConfig";

type Props = {
    id: Uuid;
    languageCode?: string;
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();

// Generate new parent id if it is a new document
const parentId = props.id == "new" ? db.uuid() : props.id;
const newDocument = props.id == "new";

// Refs
// The initial ref is populated with an empty object and thereafter filled with the actual
// data retrieved from the database.
const editableParent = ref<ContentParentDto>({
    _id: parentId,
    type: props.docType,
    updatedTimeUtc: 0,
    memberOf: [],
    tags: [],
    publishDateVisible: true,
});
const isLoading = computed(() => editableParent.value == undefined);
const existingParent = ref<ContentParentDto>(); // Previous version of the parent document for dirty check
const editableContent = ref<ContentDto[]>([]);
const existingContent = ref<ContentDto[]>(); // Previous version of the content documents for dirty check
const showDeleteModal = ref(false);

let icon = DocumentIcon;
if (props.docType == DocType.Tag) {
    icon = TagIcon;
}

if (newDocument) {
    // Set default tag properties if it is a new tag
    if (props.docType == DocType.Tag) {
        (editableParent.value as TagDto).tagType = props.tagOrPostType as TagType;
        (editableParent.value as TagDto).pinned = 0;
        (editableParent.value as TagDto).publishDateVisible = false;
    } else {
        (editableParent.value as PostDto).postType = props.tagOrPostType as PostType;
        (editableParent.value as PostDto).publishDateVisible = true;
    }
} else {
    // Get a copy of the parent document from IndexedDB, and host it as a local ref.
    db.get<PostDto | TagDto>(parentId).then((p) => {
        editableParent.value = _.cloneDeep(p);
        existingParent.value = _.cloneDeep(p);
    });

    // In the same way as the parent document, get a copy of the content documents
    db.whereParent(parentId, props.docType).then((doc) => {
        editableContent.value.push(...doc);
        existingContent.value = _.cloneDeep(doc);
    });
}

// Languages and language selection
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const untranslatedLanguages = computed(() => {
    if (!editableContent.value) {
        return [];
    }

    return languages.value
        .filter(
            (l) =>
                !editableContent.value?.find((c) => c.language == l._id && !c.deleteReq) &&
                verifyAccess(l.memberOf, DocType.Language, AclPermission.Translate),
        )
        .sort(sortByName);
});

let _selectedLanguageId = ref<Uuid | undefined>(undefined);
const selectedLanguageId = computed({
    get() {
        if (!languages.value) return undefined;
        if (props.languageCode) {
            const preferred = languages.value.find((l) => l.languageCode == props.languageCode);
            if (preferred) return preferred._id;
        }
        if (languages.value.length > 0) return languages.value[0]._id;
        return undefined;
    },
    set(val) {
        _selectedLanguageId.value = val;
    },
});

const selectedLanguage = computed(() => {
    return languages.value.find((l) => l._id == selectedLanguageId.value);
});

// Content language selection
const selectedContent = computed(() => {
    if (editableContent.value.length == 0) return undefined;
    return editableContent.value.find(
        (c) => c.language == selectedLanguageId.value && !c.deleteReq,
    );
});

const selectedContent_Existing = computed(() => {
    if (existingContent.value?.length == 0) return undefined;
    return existingContent.value?.find(
        (c) => c.language == selectedLanguageId.value && !c.deleteReq,
    );
});

const createTranslation = (language: LanguageDto) => {
    const newContent: ContentDto = {
        _id: db.uuid(),
        type: DocType.Content,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        parentId: editableParent.value?._id as Uuid,
        parentType: editableParent.value?.docType as DocType.Post | DocType.Tag,
        language: language._id,
        status: PublishStatus.Draft,
        title: `Translation for ${language.name}`,
        slug: "",
        parentTags: [],
    };
    editableContent.value?.push(newContent);
    selectedLanguageId.value = language._id;

    router.replace({
        name: "edit",
        params: {
            docType: editableParent.value?.docType,
            tagType:
                editableParent.value?.docType == DocType.Tag
                    ? (editableParent.value as unknown as TagDto).tagType
                    : undefined,
            id: editableParent.value?._id,
            languageCode: language.languageCode,
        },
    });
};

const canTranslate = computed(() => {
    if (!editableParent.value || !selectedLanguage.value) return false;
    if (!canPublish.value && selectedContent.value?.status == PublishStatus.Published) return false;
    if (!verifyAccess(editableParent.value.memberOf, props.docType, AclPermission.Translate))
        return false;
    if (!verifyAccess(selectedLanguage.value.memberOf, DocType.Language, AclPermission.Translate))
        return false;
    return true;
});

const canPublish = computed(
    () =>
        verifyAccess(editableParent.value?.memberOf || [], props.docType, AclPermission.Publish) ||
        false,
);

const canEditParent = computed(() => {
    if (editableParent.value) {
        // Allow editing if the parent is not part of any group to allow the editor to set a group
        if (editableParent.value.memberOf.length == 0) return true;

        return verifyAccess(
            editableParent.value.memberOf,
            props.docType,
            AclPermission.Edit,
            "all",
        );
    }

    return false;
});

const canDelete = computed(() => {
    if (!editableParent.value) return false;
    return verifyAccess(editableParent.value.memberOf, props.docType, AclPermission.Delete, "all");
});

// Dirty check and save
const isDirty = computed(
    () =>
        !_.isEqual(
            { ...editableParent.value, updatedBy: "" },
            { ...existingParent.value, updatedBy: "" },
        ) ||
        !_.isEqual(
            { ...editableContent.value, updatedBy: "" },
            { ...existingContent.value, updatedBy: "" },
        ),
);

const isValid = ref(true);

const saveChanges = async () => {
    if (!isValid.value) {
        addNotification({
            title: "Changes not saved",
            description: "There are validation errors that prevent saving",
            state: "error",
        });
        return;
    }

    // Check if content is currently published
    const prevContentDoc = existingContent.value?.find(
        (d) => d.language === selectedLanguageId.value,
    );
    const isPublished = prevContentDoc?.status === PublishStatus.Published;

    // If editing a published doc, require publish permission
    if (
        isPublished &&
        !verifyAccess(editableParent.value.memberOf, props.docType, AclPermission.Publish)
    ) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You cannot modify a published document without publish access.",
            state: "error",
        });
        return;
    }

    // If no translate access at all, disallow saving
    if (!canTranslate.value) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You need translate access to save this content.",
            state: "error",
        });
        return;
    }

    await save();

    addNotification({
        title: `${capitaliseFirstLetter(props.tagOrPostType)} saved`,
        description: `The ${props.tagOrPostType} was saved successfully`,
        state: "success",
    });

    existingParent.value = _.cloneDeep(editableParent.value);
    existingContent.value = _.cloneDeep(editableContent.value);
};

const save = async () => {
    // Bypass saving if the parent document is new and is marked for deletion
    if (!existingContent.value && editableParent.value.deleteReq) {
        return;
    }

    // Save the parent document
    await db.upsert({ doc: editableParent.value });

    if (!editableParent.value.deleteReq) {
        // Save the content documents that changed
        const pList: Promise<any>[] = [];
        editableContent.value.forEach((c) => {
            const prevContentDoc = existingContent.value?.find((d) => d._id == c._id);

            // Only save the document if it has changed
            if (_.isEqual(c, prevContentDoc)) return;

            // Do not save newly created documents that are marked for deletion
            if (c.deleteReq && !prevContentDoc) return;

            pList.push(db.upsert({ doc: c }));
        });

        await Promise.all(pList);
    }
};

const revertChanges = () => {
    // Restore the parent document to the previous version
    if (
        _.isEqual(editableContent.value, existingContent.value) ||
        editableContent.value.length < 1 ||
        !existingContent.value
    ) {
        addNotification({
            title: "No changes",
            description: `There were no changes to revert`,
            state: "error",
        });
        return;
    }
    editableParent.value = _.cloneDeep(existingParent.value!);

    // Restore the content documents to the previous versions
    editableContent.value = _.cloneDeep(existingContent.value!);

    addNotification({
        title: `${capitaliseFirstLetter(props.tagOrPostType)} reverted`,
        description: `The changes to the ${props.tagOrPostType} have been reverted`,
        state: "success",
    });
};

const deleteParent = async () => {
    if (!editableParent.value) return;

    if (!canDelete.value) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You do not have delete permission",
            state: "error",
        });
        return;
    }

    editableParent.value.deleteReq = 1;

    save();

    addNotification({
        title: `${capitaliseFirstLetter(props.tagOrPostType)} deleted`,
        description: `The ${props.tagOrPostType} was successfully deleted`,
        state: "success",
    });

    router.push({
        name: "overview",
        params: { docType: props.docType, tagOrPostType: props.tagOrPostType },
    });
};

const isLocalChange = db.isLocalChangeAsRef(parentId);

router.currentRoute.value.meta.title = `Edit ${props.tagOrPostType}`;

// Set the language code in the URL
watch(selectedLanguage, () => {
    if (selectedLanguage.value) {
        router.replace(
            `/${props.docType}/edit/${props.tagOrPostType}/${parentId}/${selectedLanguage.value?.languageCode}`,
        );
    }
});

const liveUrl = computed(() => {
    if (!selectedContent.value) return "";
    const url = new URL(
        selectedContent.value.slug,
        clientAppUrl.value ? clientAppUrl.value : "http://localhost",
    );
    return url.toString();
});

const ensureRedirect = () => window.open(liveUrl.value, "_blank");
</script>

<template>
    <div>{{ canPublish }}</div>
    <div
        v-if="!newDocument && !editableParent?.updatedTimeUtc"
        class="relative flex h-screen items-center justify-center"
    >
        <div class="flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-lg"><LoadingSpinner /> Loading...</div>
        </div>
    </div>
    <BasePage
        :title="selectedContent ? selectedContent.title : `Edit ${props.tagOrPostType}`"
        :icon="icon"
        :loading="isLoading"
        :backLinkLocation="{ name: 'overview' }"
        :backLinkText="`${capitaliseFirstLetter(tagOrPostType)} overview`"
        :backLinkParams="{
            docType: docType,
            tagOrPostType: tagOrPostType,
            parentId: editableParent._id,
            languageCode: languageCode,
        }"
        v-if="editableParent"
        class="relative"
    >
        <template #postTitleSlot>
            <LButton
                v-if="
                    isConnected &&
                    selectedContent_Existing &&
                    selectedContent_Existing.status == PublishStatus.Published
                "
                :icon="ArrowTopRightOnSquareIcon"
                iconRight
                class="cursor-pointer font-extralight text-zinc-600/[55%]"
                variant="tertiary"
                @click="ensureRedirect"
                target="_blank"
                title="View live version"
            ></LButton>
        </template>
        <template #actions>
            <div class="flex gap-2">
                <LBadge v-if="isLocalChange" variant="warning">Offline changes</LBadge>
                <div class="flex gap-1">
                    <LButton
                        type="button"
                        @click="revertChanges"
                        data-test="revert-changes-button"
                        variant="secondary"
                        title="Revert Changes"
                        :icon="ArrowUturnLeftIcon"
                        v-if="isDirty && !newDocument"
                    >
                        Revert
                    </LButton>
                    <LButton
                        type="button"
                        @click="saveChanges"
                        data-test="save-button"
                        variant="primary"
                        :icon="FolderArrowDownIcon"
                    >
                        Save
                    </LButton>
                    <LButton
                        type="button"
                        @click="showDeleteModal = true"
                        data-test="delete-button"
                        variant="secondary"
                        context="danger"
                        :icon="TrashIcon"
                    >
                        Delete
                    </LButton>
                </div>
            </div>
        </template>
        <div class="relative grid min-h-screen grid-cols-3 gap-8">
            <!-- Sidebar -->
            <div
                class="scrollbar col-span-3 h-screen overflow-y-auto md:col-span-1"
                v-if="editableParent"
            >
                <div class="sticky top-0 space-y-6">
                    <EditContentParentValidation
                        :can-translate="canTranslate"
                        :can-publish="canPublish"
                        :can-edit="canEditParent"
                        v-if="editableContent"
                        v-model:editableParent="editableParent"
                        v-model:editableContent="editableContent"
                        :languages="languages"
                        :untranslatedLanguages="untranslatedLanguages"
                        :dirty="isDirty"
                        :existingContent="existingContent"
                        :existingParent="existingParent"
                        @updateIsValid="(val) => (isValid = val)"
                        @createTranslation="(language) => createTranslation(language)"
                    />

                    <EditContentParent
                        v-if="editableParent"
                        :docType="props.docType"
                        :tagOrPostType="props.tagOrPostType"
                        :language="selectedLanguage"
                        v-model="editableParent"
                        :disabled="!canEditParent"
                    />
                </div>
            </div>
            <div class="scrollbar col-span-3 h-screen overflow-y-auto md:col-span-2">
                <EmptyState
                    v-if="!selectedContent"
                    :icon="icon"
                    title=""
                    :description="`Please select a language to start editing
                    `"
                    data-test="no-content"
                    ><LanguageSelector
                        :parent="editableParent"
                        :content="editableContent"
                        :languages="untranslatedLanguages"
                        v-model="selectedLanguageId"
                        @createTranslation="createTranslation"
                /></EmptyState>

                <div v-else class="space-y-6">
                    <EditContentStatus
                        v-model:content="selectedContent"
                        :disabled="!canTranslate"
                        :disablePublish="!canPublish"
                    />
                    <EditContentBasic v-model:content="selectedContent" :disabled="!canTranslate" />

                    <EditContentText v-model:content="selectedContent" :disabled="!canTranslate" />
                    <EditContentVideo v-model:content="selectedContent" :disabled="!canTranslate" />
                </div>
            </div>
        </div>
    </BasePage>
    <ConfirmBeforeLeavingModal :isDirty="isDirty && !editableParent.deleteReq" />
    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete ${props.tagOrPostType} and all translations`"
        :description="`Are you sure you want to delete this ${props.tagOrPostType} and all the translations? This action cannot be undone.`"
        :primaryAction="
            () => {
                deleteParent();
                showDeleteModal = false;
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>
</template>

<style>
.scrollbar::-webkit-scrollbar {
    display: none; /* Hide scrollbar in Chrome, Safari */
}

.scrollbar {
    -ms-overflow-style: none; /* Hide scrollbar in IE/Edge */
    scrollbar-width: none; /* Hide scrollbar in Firefox */
}
</style>
