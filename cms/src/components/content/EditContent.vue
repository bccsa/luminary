<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
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
    type RedirectDto,
    RedirectType,
    useDexieLiveQuery,
} from "luminary-shared";
import { DocumentIcon, TagIcon } from "@heroicons/vue/24/solid";
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
import {
    ArrowTopRightOnSquareIcon,
    DocumentDuplicateIcon,
    PlusIcon,
} from "@heroicons/vue/20/solid";
import { clientAppUrl } from "@/globalConfig";
import { cmsLanguages, translatableLanguagesAsRef } from "@/globalConfig";
import EditContentImage from "./EditContentImage.vue";
import EditContentActionsWrapper from "./EditContentActionsWrapper.vue";
import { TrashIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";

type Props = {
    id: Uuid;
    languageCode?: string;
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
    onOpenMobileSidebar?: () => void;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();

// Generate new parent id if it is a new document
const parentId = props.id === "new" ? db.uuid() : props.id;
const newDocument = props.id === "new";
const waitForUpdate = ref(false);

// Refs
const editableParent = ref<ContentParentDto>({
    _id: parentId,
    type: props.docType,
    updatedTimeUtc: 0,
    memberOf: [],
    tags: [],
    publishDateVisible: true,
});
const isLoading = computed(() => editableParent.value == undefined);
const existingParent = ref<ContentParentDto>();
const liveParent = useDexieLiveQuery(
    async () => (await db.get(parentId)) as unknown as Promise<ContentParentDto>,
    { initialValue: editableParent.value },
);
const editableContent = ref<ContentDto[]>([]);
const existingContent = ref<ContentDto[]>();
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
if (props.docType === DocType.Tag) {
    icon = TagIcon;
}

if (newDocument) {
    if (props.docType === DocType.Tag) {
        (editableParent.value as TagDto).tagType = props.tagOrPostType as TagType;
        (editableParent.value as TagDto).pinned = 0;
        (editableParent.value as TagDto).publishDateVisible = false;
    } else {
        (editableParent.value as PostDto).postType = props.tagOrPostType as PostType;
        (editableParent.value as PostDto).publishDateVisible = true;
    }
} else {
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
                params: { docType: props.docType, tagOrPostType: props.tagOrPostType },
            });
        }
        editableParent.value = _.cloneDeep(p);
        existingParent.value = _.cloneDeep(p);
    });

    db.whereParent(parentId, props.docType).then((doc) => {
        editableContent.value.push(...doc);
        existingContent.value = _.cloneDeep(doc);
    });
}

const untranslatedLanguages = computed(() => {
    if (!editableContent.value) return [];
    return translatableLanguagesAsRef.value
        .filter((l) => !editableContent.value?.find((c) => c.language === l._id && !c.deleteReq))
        .sort(sortByName);
});

let _selectedLanguageId = ref<Uuid | undefined>(undefined);
const selectedLanguageId = computed({
    get() {
        if (!cmsLanguages.value) return undefined;
        if (props.languageCode) {
            const preferred = cmsLanguages.value.find((l) => l.languageCode === props.languageCode);
            if (preferred) return preferred._id;
        }
        return cmsLanguages.value.length > 0 ? cmsLanguages.value[0]._id : undefined;
    },
    set(val) {
        _selectedLanguageId.value = val;
    },
});

const selectedLanguage = computed(() => {
    return cmsLanguages.value.find((l) => l._id === selectedLanguageId.value);
});

const selectedContent = computed(() => {
    if (editableContent.value.length === 0) return undefined;
    return editableContent.value.find(
        (c) => c.language === selectedLanguageId.value && !c.deleteReq,
    );
});

const selectedContent_Existing = computed(() => {
    if (existingContent.value?.length === 0) return undefined;
    return existingContent.value?.find(
        (c) => c.language === selectedLanguageId.value && !c.deleteReq,
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
                editableParent.value?.docType === DocType.Tag
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
    if (!canPublish.value && selectedContent.value?.status === PublishStatus.Published)
        return false;
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
        if (editableParent.value.memberOf.length === 0) return true;
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
    if (selectedContent.value._id !== selectedContent_Existing.value._id) return;
    if (
        selectedContent.value.slug === selectedContent_Existing.value.slug ||
        !verifyAccess(selectedContent.value.memberOf, DocType.Redirect, AclPermission.Edit)
    )
        return;
    if (
        selectedContent_Existing.value.status !== PublishStatus.Published ||
        selectedContent.value.status !== PublishStatus.Published
    )
        return;
    if (
        (selectedContent.value.publishDate && selectedContent.value.publishDate > Date.now()) ||
        (selectedContent_Existing.value.publishDate &&
            selectedContent_Existing.value.publishDate > Date.now())
    )
        return;
    if (
        (selectedContent.value.expiryDate && selectedContent.value.expiryDate <= Date.now()) ||
        (selectedContent_Existing.value.expiryDate &&
            selectedContent_Existing.value.expiryDate <= Date.now())
    )
        return;

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
    const prevContentDoc = existingContent.value?.find(
        (d) => d.language === selectedLanguageId.value,
    );
    const isPublished = prevContentDoc?.status === PublishStatus.Published;
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
    if (!canTranslate.value) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You need translate access to save this content.",
            state: "error",
        });
        return;
    }
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
        waitForUpdate.value = true;
    }
    if (!existingContent.value && editableParent.value.deleteReq) return;
    await db.upsert({ doc: editableParent.value });
    if (!editableParent.value.deleteReq) {
        const pList: Promise<any>[] = [];
        editableContent.value.forEach((c) => {
            const prevContentDoc = existingContent.value?.find((d) => d._id === c._id);
            if (_.isEqual(c, prevContentDoc)) return;
            if (c.deleteReq && !prevContentDoc) return;
            pList.push(db.upsert({ doc: c }));
        });
        await Promise.all(pList);
    }
};

const revertChanges = () => {
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

router.currentRoute.value.meta.title = `Edit ${props.tagOrPostType}`;

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

const showDuplicateModal = ref(false);
const duplicate = async () => {
    showDuplicateModal.value = false;
    if (!editableParent.value) return;
    const clonedParent = _.cloneDeep(editableParent.value);
    clonedParent._id = db.uuid();
    delete (clonedParent as any)._rev;
    clonedParent.tags = [];
    if (clonedParent.type === DocType.Tag) (clonedParent as TagDto).taggedDocs = [];
    if (clonedParent.imageData?.fileCollections) clonedParent.imageData.fileCollections = [];
    const clonedContent = editableContent.value.map((c) => {
        const newContent = _.cloneDeep(c);
        newContent._id = db.uuid();
        delete (newContent as any)._rev;
        newContent.updatedTimeUtc = Date.now();
        newContent.title += " (Copy)";
        newContent.slug += "-copy";
        newContent.parentId = clonedParent._id;
        newContent.parentType = editableParent.value.type;
        newContent.status = PublishStatus.Draft;
        newContent.parentTags = [];
        newContent.parentTaggedDocs = [];
        return newContent;
    });
    editableParent.value = clonedParent;
    editableContent.value = clonedContent;
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

const contentActions = computed(() => {
    const actions = [
        {
            name: "Preview",
            action: () => window.open(liveUrl.value, "_blank"),
            icon: ArrowTopRightOnSquareIcon,
            iconClass: "h-5 w-5 flex-shrink-0 text-zinc-500",
        },
        {
            name: "Duplicate",
            action: () => (showDuplicateModal.value = true),
            icon: DocumentDuplicateIcon,
            iconClass: "h-5 w-5 flex-shrink-0 text-zinc-500",
        },
    ];
    if (canDelete.value) {
        actions.push({
            name: "Delete",
            action: () => (showDeleteModal.value = true),
            icon: TrashIcon,
            iconClass: "h-5 w-5 text-red-500 flex-shrink-0",
        });
    }
    return actions;
});

const isLocalChange = db.isLocalChangeAsRef(parentId);
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
        :onOpenMobileSidebar="onOpenMobileSidebar"
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
            <EditContentActionsWrapper
                :revert="revertChanges"
                :save="saveChanges"
                :delete="deleteParent"
                :duplicate="duplicate"
                :parentId="editableParent._id"
                :liveUrl="liveUrl"
                :isPublished="selectedContent_Existing?.status === PublishStatus.Published"
                :mobile="true"
                :newDocument="newDocument"
                :isDirty="isDirty"
                :isLocalChange="isLocalChange"
                :actions="contentActions"
            />
        </template>
        <!-- desktop actions -->
        <template #topBarActionsDesktop>
            <EditContentActionsWrapper
                :revert="revertChanges"
                :save="saveChanges"
                :delete="deleteParent"
                :duplicate="duplicate"
                :parentId="editableParent._id"
                :liveUrl="liveUrl"
                :isPublished="selectedContent_Existing?.status === PublishStatus.Published"
                :mobile="false"
                :newDocument="newDocument"
                :isDirty="isDirty"
                :isLocalChange="isLocalChange"
                :actions="contentActions"
            />
        </template>
        <div class="flex h-full flex-col gap-2 lg:flex-row lg:overflow-y-hidden">
            <!-- sidebar -->
            <div
                class="h-screen w-full flex-shrink-0 overflow-y-auto overflow-x-hidden lg:w-[336px]"
                v-if="editableParent"
            >
                <div class="h-full overflow-x-hidden scrollbar-hide sm:pb-16">
                    <div class="flex flex-col gap-2 overflow-x-hidden pb-4">
                        <EditContentImage
                            v-if="editableParent"
                            :docType="props.docType"
                            :tagOrPostType="props.tagOrPostType"
                            :disabled="!canEditParent"
                            :newDocument="newDocument"
                            v-model:parent="editableParent"
                        />

                        <div class="sticky -top-1 z-10 lg:static">
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
                        <!-- MOBILE CONTENT EDITOR -->
                        <div class="block w-full scrollbar-hide lg:hidden">
                            <EmptyState
                                v-if="!selectedContent"
                                :icon="icon"
                                title=""
                                :description="`Please select a language to start editing`"
                                data-test="no-content"
                                class="mb-3 flex flex-col items-center justify-center"
                            >
                                <div class="relative flex flex-col items-center">
                                    <LButton
                                        :icon="PlusIcon"
                                        class="h-max w-fit"
                                        variant="muted"
                                        @click.stop="showLanguageSelector = !showLanguageSelector"
                                        data-test="add-translation-button"
                                        aria-label="Add translation"
                                    ></LButton>
                                    <div
                                        class="absolute bottom-full left-1/2 mb-1 -translate-x-1/2"
                                    >
                                        <LanguageSelector
                                            data-test="placeholder-language-selector"
                                            :parent="editableParent"
                                            :content="editableContent"
                                            :languages="untranslatedLanguages"
                                            v-model:show-selector="showLanguageSelector"
                                            @create-translation="createTranslation"
                                            placement="top-center"
                                        />
                                    </div>
                                </div>
                            </EmptyState>
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
                    :description="`Please select a language to start editing`"
                    data-test="no-content"
                >
                    <div class="relative inline-block w-fit">
                        <LButton
                            :icon="PlusIcon"
                            class="w-fit"
                            variant="muted"
                            @click.stop="showLanguageSelector = !showLanguageSelector"
                            data-test="add-translation-button"
                            aria-label="Add translation"
                        >
                            <template #tooltip>Add a new translation</template>
                        </LButton>

                        <LanguageSelector
                            data-test="language-selector"
                            :parent="editableParent"
                            :content="editableContent"
                            :languages="untranslatedLanguages"
                            v-model:show-selector="showLanguageSelector"
                            @create-translation="createTranslation"
                        />
                    </div>
                </EmptyState>
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

    <!-- modals -->
    <ConfirmBeforeLeavingModal :isDirty="isDirty && !editableParent.deleteReq" />
    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete ${props.tagOrPostType} and all translations`"
        :description="`Are you sure you want to delete this ${props.tagOrPostType} and all the translations? This action cannot be undone.`"
        :primaryAction="
            async () => {
                await deleteParent();
                showDeleteModal = false;
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    />
    <LDialog
        v-model:open="showDuplicateModal"
        :title="`Duplicate ${props.tagOrPostType} and all translations`"
        :description="`Are you sure you want to duplicate this ${props.tagOrPostType} and all the translations without saving? Consider saving this ${props.tagOrPostType} before continuing to not lose changes.`"
        :primaryAction="
            async () => {
                await duplicate();
                showDuplicateModal = false;
            }
        "
        :secondaryAction="() => (showDuplicateModal = false)"
        primaryButtonText="Duplicate"
        secondaryButtonText="Cancel"
        context="danger"
    />
</template>
