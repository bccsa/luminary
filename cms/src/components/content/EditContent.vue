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
    type RedirectDto,
    RedirectType,
    useDexieLiveQuery,
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
import { ArrowTopRightOnSquareIcon, DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { clientAppUrl } from "@/globalConfig";
import { cmsLanguages, translatableLanguagesAsRef } from "@/globalConfig";

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

const waitForUpdate = ref(false);

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
const liveParent = useDexieLiveQuery(
    async () => (await db.get(parentId)) as unknown as Promise<ContentParentDto>,
    {
        initialValue: editableParent.value,
    },
);

const editableContent = ref<ContentDto[]>([]);
const existingContent = ref<ContentDto[]>(); // Previous version of the content documents for dirty check
const showDeleteModal = ref(false);

watch(liveParent, (parent) => {
    if (
        waitForUpdate.value &&
        parent &&
        editableParent.value.imageData &&
        !parent.imageData?.uploadData
    ) {
        editableParent.value.imageData = (parent as ContentParentDto).imageData;
        waitForUpdate.value = false;
    }
});

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

const untranslatedLanguages = computed(() => {
    if (!editableContent.value) return [];

    return translatableLanguagesAsRef.value
        .filter((l) => !editableContent.value?.find((c) => c.language == l._id && !c.deleteReq))
        .sort(sortByName);
});

let _selectedLanguageId = ref<Uuid | undefined>(undefined);
const selectedLanguageId = computed({
    get() {
        if (!cmsLanguages.value) return undefined;
        if (props.languageCode) {
            const preferred = cmsLanguages.value.find((l) => l.languageCode == props.languageCode);
            if (preferred) return preferred._id;
        }
        if (cmsLanguages.value.length > 0) return cmsLanguages.value[0]._id;
        return undefined;
    },
    set(val) {
        _selectedLanguageId.value = val;
    },
});

const selectedLanguage = computed(() => {
    return cmsLanguages.value.find((l) => l._id == selectedLanguageId.value);
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

const createRedirect = async () => {
    if (!selectedContent.value || !selectedContent_Existing.value) return;

    // If the slug is the same or if the user does not have edit access to redirects, do not create a redirect
    if (
        selectedContent.value.slug === selectedContent_Existing.value.slug ||
        !verifyAccess(selectedContent.value.memberOf, DocType.Redirect, AclPermission.Edit)
    )
        return;

    // Do not create a redirect if the content was not published or is currently not published
    if (
        selectedContent_Existing.value.status !== PublishStatus.Published ||
        selectedContent.value.status !== PublishStatus.Published
    )
        return;

    // Do not create a redirect if the content was scheduled or is currently scheduled
    if (
        (selectedContent.value.publishDate && selectedContent.value.publishDate > Date.now()) ||
        (selectedContent_Existing.value.publishDate &&
            selectedContent_Existing.value.publishDate > Date.now())
    )
        return;

    // Do not create a redirect if the content was expired or is currently expired
    if (
        (selectedContent.value.expiryDate && selectedContent.value.expiryDate <= Date.now()) ||
        (selectedContent_Existing.value.expiryDate &&
            selectedContent_Existing.value.expiryDate <= Date.now())
    )
        return;

    // Create a new redirect document
    const newRedirect: RedirectDto = {
        _id: db.uuid(),
        type: DocType.Redirect,
        updatedTimeUtc: Date.now(),
        memberOf: [...selectedContent.value.memberOf],
        slug: selectedContent_Existing.value.slug,
        redirectType: RedirectType.Temporary,
        toSlug: selectedContent.value.slug,
    };

    addNotification({
        title: "Redirect created",
        description: `A redirect was created from ${selectedContent_Existing.value.slug} to ${selectedContent.value.slug}`,
        state: "info",
    });

    await db.upsert({ doc: newRedirect });
};

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

    /**
     * Create a redirect if neccessary
     * This is done if the content document is currently published,
     * was already published, the slug has changed
     * and the user has edit access to redirect documents.
     */
    await createRedirect();

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
    if (
        existingParent.value?.imageData?.uploadData !== editableParent.value.imageData?.uploadData
    ) {
        // If the image data has changed, we need to wait for the server to update the image data
        // before saving the parent document
        waitForUpdate.value = true;
    }

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
        (_.isEqual(editableContent.value, existingContent.value) &&
            _.isEqual(editableParent.value, existingParent.value)) ||
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

const showDuplicateModal = ref(false);

const duplicate = async () => {
    showDuplicateModal.value = false;

    if (!editableParent.value) return;

    // Handle new data for duplicated document and keep old data
    const clonedParent = _.cloneDeep(editableParent.value);
    clonedParent._id = db.uuid();

    // Remove Original Image
    if (clonedParent.imageData) {
        if (clonedParent.imageData.fileCollections) {
            clonedParent.imageData.fileCollections = [];
        }
    }

    // Duplicate all content documents and make them unique
    const clonedContent = editableContent.value.map((c) => {
        const newContent = _.cloneDeep(c);
        newContent._id = db.uuid();
        newContent.updatedTimeUtc = Date.now();
        newContent.title += " (Copy)";
        newContent.slug += "-copy";
        newContent.parentId = clonedParent._id;
        newContent.status = PublishStatus.Draft;

        return newContent;
    });

    editableParent.value = clonedParent;
    editableContent.value = clonedContent;

    // Don't route in test environment so component isn't remounted and loses data integrity
    // for relevant tests
    if (import.meta.env.MODE !== "test") {
        await router.replace({
            name: "edit",
            params: {
                docType: props.docType,
                tagType: props.docType === DocType.Tag ? props.tagOrPostType : undefined,
                id: clonedParent._id,
                languageCode: selectedLanguage.value?.languageCode,
                tagOrPostType: props.tagOrPostType,
            },
        });
    }

    addNotification({
        title: "Successfully duplicated",
        description: `This ${props.tagOrPostType} has successfully been duplicated`,
        state: "success",
    });
};
const showLanguageSelector = ref(false);
</script>

<template>
    <div
        v-if="!newDocument && !editableParent?.updatedTimeUtc"
        class="relative flex items-center justify-center"
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
            />
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
                        :icon="DocumentDuplicateIcon"
                        title="Duplicate"
                        data-test="duplicate-btn"
                        @click="isDirty ? (showDuplicateModal = true) : duplicate()"
                        >Duplicate</LButton
                    >
                    <LButton
                        v-if="canDelete"
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
        <div class="relative grid min-h-full grid-cols-3 gap-8">
            <!-- Sidebar -->
            <div class="relative col-span-3 md:col-span-1" v-if="editableParent">
                <div class="relative size-full space-y-6">
                    <EditContentParentValidation
                        :tag-or-post-type="props.tagOrPostType"
                        :can-translate="canTranslate"
                        :can-delete="canDelete"
                        :can-publish="canPublish"
                        :can-edit="canEditParent"
                        v-if="editableContent"
                        v-model:editableParent="editableParent"
                        v-model:editableContent="editableContent"
                        :languages="cmsLanguages"
                        :untranslatedLanguages="untranslatedLanguages"
                        :dirty="isDirty"
                        :existingContent="existingContent"
                        :existingParent="existingParent"
                        @updateIsValid="(val) => (isValid = val)"
                        @create-translation="(language) => createTranslation(language)"
                    />

                    <div class="sticky top-0">
                        <EditContentParent
                            v-if="editableParent"
                            :docType="props.docType"
                            :tagOrPostType="props.tagOrPostType"
                            :language="selectedLanguage"
                            v-model:parent="editableParent"
                            :disabled="!canEditParent"
                        />
                    </div>
                </div>
            </div>
            <div class="col-span-3 min-h-full md:col-span-2">
                <EmptyState
                    v-if="!selectedContent"
                    :icon="icon"
                    title=""
                    :description="`Please select a language to start editing
                    `"
                    data-test="no-content"
                    class="flex flex-col items-center"
                    ><LanguageSelector
                        :parent="editableParent"
                        :content="editableContent"
                        :languages="untranslatedLanguages"
                        v-model:show-selector="showLanguageSelector"
                        @create-translation="createTranslation"
                /></EmptyState>

                <div v-else class="mb-48 space-y-6">
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
    <LDialog
        v-model:open="showDuplicateModal"
        :title="`Duplicate ${props.tagOrPostType} and all translations`"
        :description="`Are you sure you want to duplicate this ${props.tagOrPostType} and all the translations without saving? Consider saving this ${props.tagOrPostType} before continuing to not lose changes.`"
        :primaryAction="
            () => {
                duplicate();
                showDuplicateModal = false;
            }
        "
        :secondaryAction="() => (showDuplicateModal = false)"
        primaryButtonText="Duplicate"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>
</template>
