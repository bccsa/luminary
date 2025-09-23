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
import { EllipsisVerticalIcon } from "@heroicons/vue/24/outline";
import { computed, ref, watch } from "vue";
import EditContentText from "@/components/content/EditContentText.vue";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import EditContentVideo from "@/components/content/EditContentVideo.vue";
import EditContentParentValidation from "@/components/content/EditContentParentValidation.vue";
import EmptyState from "@/components/EmptyState.vue";
import LoadingBar from "@/components/LoadingBar.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import * as _ from "lodash";
import router from "@/router";
import { capitaliseFirstLetter } from "@/util/string";
import { sortByName } from "@/util/sortByName";
import { ArrowTopRightOnSquareIcon, DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { clientAppUrl } from "@/globalConfig";
import { cmsLanguages, translatableLanguagesAsRef } from "@/globalConfig";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/vue";
import EditContentImage from "./EditContentImage.vue";
import EditContentMedia from "./EditContentMedia.vue";

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
        existingParent.value = _.cloneDeep(editableParent.value);
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
        if (!p) {
            addNotification({
                title: "Parent not found",
                description: "The parent document was not found in the database",
                state: "error",
                timer: 5000,
            });

            router.push({
                name: "overview",
                params: {
                    docType: props.docType,
                    tagOrPostType: props.tagOrPostType,
                },
            });
        }

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
    if (editableParent.value.memberOf.length === 0) return true;
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

    // Only create a redirect when we're working with the SAME content document.
    if (selectedContent.value._id !== selectedContent_Existing.value._id) return;

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
const showContentActionMenu = ref(false);

const contentActions = computed(() => {
    const actions = [];

    if (
        isConnected.value &&
        selectedContent_Existing.value &&
        selectedContent_Existing.value.status === PublishStatus.Published
    ) {
        actions.push({
            name: "View live",
            action: ensureRedirect,
            icon: ArrowTopRightOnSquareIcon,
            iconClass: "h-5 w-5 flex-shrink-0 text-zinc-500",
        });
    }

    actions.push(
        {
            name: "Save changes",
            action: saveChanges,
            icon: FolderArrowDownIcon,
            iconClass: "h-5 w-5 flex-shrink-0 text-zinc-500",
        },
        {
            name: "Duplicate",
            action: duplicate,
            icon: DocumentDuplicateIcon,
            iconClass: "h-5 w-5 flex-shrink-0 text-zinc-500",
        },
        {
            name: "Delete",
            action: () => (showDeleteModal.value = true),
            icon: TrashIcon,
            iconClass: "h-5 w-5 text-red-500 flex-shrink-0",
        },
    );

    return actions;
});

// Watch for changes in dirty state and new document state to add or remove the revert action
watch(
    [isDirty, () => newDocument],
    ([dirty, isNew]) => {
        const revertActionIndex = contentActions.value.findIndex(
            (a) => a.name === "Revert changes",
        );
        if (dirty && !isNew) {
            if (revertActionIndex === -1) {
                contentActions.value.unshift({
                    name: "Revert changes",
                    action: revertChanges as any,
                    icon: ArrowUturnLeftIcon,
                    iconClass: "h-5 w-5 flex-shrink-0 text-zinc-500",
                });
            }
        } else if (revertActionIndex !== -1) {
            contentActions.value.splice(revertActionIndex, 1);
        }
    },
    { immediate: true },
);
</script>

<template>
    <div
        v-if="!newDocument && !editableParent?.updatedTimeUtc"
        class="relative flex items-center justify-center"
    >
        <div class="flex flex-col items-center gap-4">
            <div class="flex items-center gap-2 text-lg"><LoadingBar /></div>
        </div>
    </div>
    <BasePage
        :icon="icon"
        :loading="isLoading"
        :backLinkParams="{
            docType: docType,
            tagOrPostType: tagOrPostType,
            parentId: editableParent._id,
            languageCode: languageCode,
        }"
        v-if="editableParent"
        class="relative"
    >
        <template #pageNav>
            <h1 class="text-md font-semibold leading-7 lg:hidden">
                {{ `Edit ${props.docType}` }}
            </h1>
            <h1 class="text-md hidden font-semibold leading-7 lg:block">
                {{ selectedContent?.title }}
            </h1>
        </template>

        <template #topBarActionsMobile>
            <Menu as="div" class="relative flex">
                <LBadge v-if="isLocalChange" variant="warning" class="text-nowrap lg:hidden"
                    >Offline changes</LBadge
                >
                <MenuButton class="flex w-full items-center justify-between">
                    <EllipsisVerticalIcon
                        class="ml-2 h-6 w-6 text-zinc-500 hover:text-zinc-700 lg:hidden"
                        @click="showContentActionMenu = !showContentActionMenu"
                    />
                </MenuButton>

                <transition
                    enter-active-class="transition ease-out duration-100"
                    enter-from-class="transform opacity-0 scale-95"
                    enter-to-class="transform opacity-100 scale-100"
                    leave-active-class="transition ease-in duration-75"
                    leave-from-class="transform opacity-100 scale-100"
                    leave-to-class="transform opacity-0 scale-95"
                >
                    <MenuItems
                        class="absolute right-0 z-50 mt-2.5 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-zinc-900/5 focus:outline-none"
                    >
                        <MenuItem
                            v-for="action in contentActions"
                            :key="action.name"
                            v-slot="{ active }"
                        >
                            <button
                                :class="[
                                    active ? 'bg-zinc-50' : '',
                                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm leading-6 text-zinc-900 ',
                                ]"
                                @click="action.action"
                            >
                                <component
                                    :is="action.icon"
                                    :class="action.iconClass"
                                    aria-hidden="true"
                                />
                                <div class="flex flex-col text-nowrap leading-none">
                                    {{ action.name }}
                                </div>
                            </button>
                        </MenuItem>
                    </MenuItems>
                </transition>
            </Menu>
        </template>

        <template #topBarActionsDesktop>
            <div class="hidden gap-1 lg:flex">
                <LBadge v-if="isLocalChange" variant="warning" class="hidden lg:inline-flex"
                    >Offline changes</LBadge
                >

                <LButton
                    type="button"
                    @click="revertChanges"
                    data-test="revert-changes-button"
                    variant="secondary"
                    :icon="ArrowUturnLeftIcon"
                    v-if="isDirty && !newDocument"
                >
                    <template #tooltip>Revert changes made on this content</template>
                </LButton>

                <LButton
                    v-if="
                        isConnected &&
                        selectedContent_Existing &&
                        selectedContent_Existing.status == PublishStatus.Published
                    "
                    :icon="ArrowTopRightOnSquareIcon"
                    iconRight
                    variant="secondary"
                    @click="ensureRedirect"
                    target="_blank"
                    name="view-live"
                >
                    <template #tooltip> View live version </template>
                </LButton>

                <LButton
                    :icon="DocumentDuplicateIcon"
                    data-test="duplicate-btn"
                    @click="isDirty ? (showDuplicateModal = true) : duplicate()"
                >
                    <template #tooltip>Duplicate this {{ props.tagOrPostType }}</template>
                </LButton>
                <LButton
                    type="button"
                    @click="saveChanges"
                    data-test="save-button"
                    variant="primary"
                    :icon="FolderArrowDownIcon"
                >
                    <template #tooltip>Save changes</template>
                </LButton>

                <LButton
                    v-if="canDelete"
                    type="button"
                    @click="showDeleteModal = true"
                    data-test="delete-button"
                    variant="secondary"
                    context="danger"
                    :icon="TrashIcon"
                >
                    <template #tooltip>Delete this {{ props.tagOrPostType }}</template>
                </LButton>
            </div>
        </template>
        <div class="flex h-full flex-col gap-2 overflow-y-auto lg:flex-row lg:overflow-y-hidden">
            <!-- sidebar -->
            <div class="w-full flex-shrink-0 lg:w-[336px]" v-if="editableParent">
                <div class="max-h-screen overflow-scroll scrollbar-hide sm:pb-16">
                    <div class="flex flex-col gap-2 sm:pb-4">
                        <EditContentParent
                            v-if="editableParent"
                            :docType="props.docType"
                            :tagOrPostType="props.tagOrPostType"
                            :language="selectedLanguage"
                            v-model:parent="editableParent"
                            :disabled="!canEditParent"
                            :existingParent="existingParent"
                            :newDocument="newDocument"
                        />

                        <EditContentImage
                            v-if="editableParent"
                            :docType="props.docType"
                            :tagOrPostType="props.tagOrPostType"
                            :disabled="!canEditParent"
                            :newDocument="newDocument"
                            v-model:parent="editableParent"
                        />

                        <EditContentMedia
                            v-if="editableParent"
                            :docType="props.docType"
                            :tagOrPostType="props.tagOrPostType"
                            :disabled="!canEditParent"
                            :newDocument="newDocument"
                            v-model:parent="editableParent"
                        />

                        <div class="sticky -top-1 z-10">
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
                        </div>

                        <EditContentVideo
                            v-model:content="selectedContent"
                            :disabled="!canTranslate"
                        />
                        <EditContentBasic
                            v-model:content="selectedContent"
                            :selectedLanguage="selectedLanguage!"
                            :disabled="!canTranslate"
                            :disable-publish="!canPublish"
                        />

                        <!-- This is for mobile  -->
                        <div class="block w-full scrollbar-hide lg:hidden">
                            <EmptyState
                                v-if="!selectedContent"
                                :icon="icon"
                                title=""
                                :description="`Please select a language to start editing`"
                                data-test="no-content"
                                class="flex flex-col items-center justify-center"
                                ><LanguageSelector
                                    :parent="editableParent"
                                    :content="editableContent"
                                    :languages="untranslatedLanguages"
                                    v-model:show-selector="showLanguageSelector"
                                    @create-translation="createTranslation"
                            /></EmptyState>

                            <div v-else>
                                <EditContentText
                                    v-model:content="selectedContent"
                                    :selectedLanguage="selectedLanguage!"
                                    :disabled="!canTranslate"
                                    :disablePublish="!canPublish"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- main content | This is for desktop-->
            <div class="hidden w-full scrollbar-hide lg:block">
                <EmptyState
                    v-if="!selectedContent"
                    :icon="icon"
                    title=""
                    :description="`Please select a language to start editing
                    `"
                    data-test="no-content"
                    class="flex flex-col items-center justify-center"
                    ><LanguageSelector
                        :parent="editableParent"
                        :content="editableContent"
                        :languages="untranslatedLanguages"
                        v-model:show-selector="showLanguageSelector"
                        @create-translation="createTranslation"
                /></EmptyState>

                <div v-else class="">
                    <EditContentText
                        v-model:content="selectedContent"
                        :selectedLanguage="selectedLanguage!"
                        :disabled="!canTranslate"
                        :disablePublish="!canPublish"
                        class="hidden lg:block"
                    />
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
