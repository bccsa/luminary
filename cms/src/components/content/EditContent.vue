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
    type TagDto,
    type Uuid,
    verifyAccess,
    PostType,
} from "luminary-shared";
import { useEditContentSource } from "./composables/useEditContentSource";
import { useContentLanguage } from "./composables/useContentLanguage";
import { useContentPermissions } from "./composables/useContentPermissions";
import { buildContentDuplicate } from "./util/buildContentDuplicate";
import { buildRedirects } from "./util/buildRedirects";
import { DocumentIcon, TagIcon } from "@heroicons/vue/24/solid";
import { computed, ref, watch } from "vue";
import EditContentText from "@/components/content/EditContentText.vue";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import EditContentVideo from "@/components/content/EditContentVideo.vue";
import EditContentParentValidation from "@/components/content/EditContentParentValidation.vue";
import EmptyState from "@/components/EmptyState.vue";
import LoadingBar from "@/components/LoadingBar.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import router from "@/router";
import { capitaliseFirstLetter } from "@/util/string";
import {
    ArrowTopRightOnSquareIcon,
    PlusIcon,
    ChevronDownIcon,
    CheckCircleIcon,
} from "@heroicons/vue/20/solid";
import { DocumentDuplicateIcon } from "@heroicons/vue/24/outline";
import { clientAppUrl, cmsLanguages } from "@/globalConfig";
import EditContentImage from "./EditContentImage.vue";
import EditContentMedia from "./EditContentMedia.vue";
import LCard from "@/components/common/LCard.vue";
import EditContentActionsWrapper from "./EditContentActionsWrapper.vue";
import { TrashIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import LDropdown from "../common/LDropdown.vue";

type Props = {
    id: Uuid;
    languageCode?: string;
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
    onOpenMobileSidebar?: () => void;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();

// Data layer — local-first loading, editable copies + dirty tracking, and the
// save / revert / duplicate primitives — lives in the composable. UI orchestration
// (permissions, notifications, routing, language selection) stays here.
const source = useEditContentSource({
    id: () => props.id,
    docType: props.docType,
    tagOrPostType: props.tagOrPostType,
    onParentNotFound: () => {
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
    },
});
const {
    newDocument,
    editableParent,
    editableContent,
    existingContent,
    isDirty,
    isParentDirty,
    isContentItemDirty,
    hasLocalChanges,
    isLoading,
} = source;

const showDeleteModal = ref(false);

const icon = props.docType === DocType.Tag ? TagIcon : DocumentIcon;

const notify = (state: "success" | "error" | "info", title: string, description: string) =>
    addNotification({ title, description, state });

// Which translation is being edited (driven by the route), + the language lists.
const {
    selectedLanguageId,
    selectedLanguage,
    selectedContent,
    selectedContentExisting,
    untranslatedLanguages,
} = useContentLanguage({
    languageCode: () => props.languageCode,
    editableContent,
    existingContent,
});

// ACL-derived capability flags for the current parent + selected language.
const { canTranslate, canPublish, canEditParent, canDelete } = useContentPermissions({
    editableParent,
    docType: props.docType,
    selectedLanguage,
    selectedContent,
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
    editableContent.value.push(newContent);
    // Navigate to the new translation — the route's languageCode drives selection.
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

const isValid = ref(true);

// Create redirects (old slug → new slug) for any published translation whose slug
// changed and the user has redirect-edit access to.
const createRedirect = async () => {
    if (!existingContent.value) return;
    const redirects = buildRedirects(editableContent.value, existingContent.value);
    await Promise.all(redirects.map((redirect) => db.upsert({ doc: redirect })));
    redirects.forEach((redirect) =>
        notify(
            "info",
            "Redirect created",
            `A redirect was created from ${redirect.slug} to ${redirect.toSlug}`,
        ),
    );
};

const saveChanges = async () => {
    if (!isValid.value) {
        notify("error", "Changes not saved", "There are validation errors that prevent saving");
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
        notify(
            "error",
            "Insufficient Permissions",
            "You cannot modify a published document without publish access.",
        );
        return;
    }
    if (!canTranslate.value) {
        notify(
            "error",
            "Insufficient Permissions",
            "You need translate access to save this content.",
        );
        return;
    }

    await createRedirect();
    await source.save();
    notify(
        "success",
        `${capitaliseFirstLetter(props.tagOrPostType)} saved`,
        `The ${props.tagOrPostType} was saved successfully`,
    );
};

const revertChanges = () => {
    if (!isDirty.value) {
        notify("error", "No changes", "There were no changes to revert");
        return;
    }
    source.revert();
    notify(
        "success",
        `${capitaliseFirstLetter(props.tagOrPostType)} reverted`,
        `The changes to the ${props.tagOrPostType} have been reverted`,
    );
};

const deleteParent = async () => {
    if (!editableParent.value) return;
    if (!canDelete.value) {
        notify("error", "Insufficient Permissions", "You do not have delete permission");
        return;
    }

    const deleted = await source.deleteParent();
    if (!deleted) {
        notify(
            "error",
            `Failed to delete ${props.tagOrPostType}`,
            `The ${props.tagOrPostType} could not be deleted`,
        );
        return;
    }

    notify(
        "success",
        `${capitaliseFirstLetter(props.tagOrPostType)} deleted`,
        `The ${props.tagOrPostType} was successfully deleted`,
    );
    router.push({
        name: "overview",
        params: { docType: props.docType, tagOrPostType: props.tagOrPostType },
    });
};

router.currentRoute.value.meta.title = `Edit ${props.tagOrPostType}`;

watch(selectedLanguage, () => {
    if (selectedLanguage.value && editableParent.value) {
        router.replace(
            `/${props.docType}/edit/${props.tagOrPostType}/${editableParent.value._id}/${selectedLanguage.value?.languageCode}`,
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
const duplicateImageOnCopy = ref(true);
watch(showDuplicateModal, (open) => {
    if (open) duplicateImageOnCopy.value = true;
});

const duplicate = async () => {
    showDuplicateModal.value = false;
    if (!editableParent.value) return;
    const { parent: clonedParent, content: clonedContent } = buildContentDuplicate(
        editableParent.value,
        editableContent.value,
        { duplicateImage: duplicateImageOnCopy.value },
    );
    source.installClones(clonedParent, clonedContent);
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
    notify(
        "success",
        "Successfully duplicated",
        `This ${props.tagOrPostType} has successfully been duplicated`,
    );
};

const showLanguageSelector = ref(false);

// Quick language switcher (app SingleContent-style) — switch the translation being
// edited from a compact dropdown. The existing translations' language docs, sorted.
const showQuickLang = ref(false);
const translationLanguages = computed(() =>
    editableContent.value
        .filter((c) => !c.deleteReq)
        .map((c) => cmsLanguages.value.find((l) => l._id === c.language))
        .filter((l): l is LanguageDto => !!l)
        .sort((a, b) => a.name.localeCompare(b.name)),
);
const switchLanguage = (lang: LanguageDto) => {
    showQuickLang.value = false;
    if (!editableParent.value) return;
    // Same navigation the translation badges use — the route's languageCode drives selection.
    router.replace({
        name: "edit",
        params: {
            docType: editableParent.value.docType,
            tagType:
                editableParent.value.docType === DocType.Tag
                    ? (editableParent.value as unknown as TagDto).tagType
                    : undefined,
            id: editableParent.value._id,
            languageCode: lang.languageCode,
        },
    });
};

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

// Shared props for the mobile + desktop action bars (they differ only by `mobile`).
const actionsWrapperProps = computed(() => ({
    revert: revertChanges,
    save: saveChanges,
    delete: deleteParent,
    duplicate,
    parentId: editableParent.value?._id,
    liveUrl: liveUrl.value,
    isPublished: selectedContentExisting.value?.status === PublishStatus.Published,
    newDocument,
    isDirty: isDirty.value,
    isLocalChange: hasLocalChanges.value,
    actions: contentActions.value,
}));
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
        :is-full-width="true"
        :backLinkParams="{
            docType: docType,
            tagOrPostType: tagOrPostType,
            parentId: editableParent._id,
            languageCode: languageCode,
        }"
        :onOpenMobileSidebar="onOpenMobileSidebar"
        :contentInset="false"
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

        <template #languageSelector>
            <div
                v-if="selectedLanguage && translationLanguages.length > 1"
                class="flex px-1 lg:hidden"
            >
                <LDropdown v-model:show="showQuickLang" placement="bottom-end">
                    <template #trigger>
                        <button
                            type="button"
                            data-test="quick-language-switch"
                            class="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                            {{ selectedLanguage.languageCode.toUpperCase() }}
                            <ChevronDownIcon class="h-4 w-4 text-zinc-500" />
                        </button>
                    </template>
                    <div class="py-1">
                        <button
                            v-for="lang in translationLanguages"
                            :key="lang._id"
                            type="button"
                            role="menuitem"
                            data-test="quick-language-option"
                            class="flex w-full items-center justify-between gap-3 whitespace-nowrap px-4 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                            @click="switchLanguage(lang)"
                        >
                            {{ lang.name }}
                            <CheckCircleIcon
                                v-if="lang._id === selectedLanguage._id"
                                class="h-5 w-5 flex-shrink-0 text-yellow-500"
                            />
                        </button>
                    </div>
                </LDropdown>
            </div>
        </template>

        <template #topBarActionsMobile>
            <EditContentActionsWrapper v-bind="actionsWrapperProps" :mobile="true" />
        </template>
        <!-- desktop actions -->
        <template #topBarActionsDesktop>
            <EditContentActionsWrapper v-bind="actionsWrapperProps" :mobile="false" />
        </template>
        <div
            class="flex flex-col gap-0 lg:h-full lg:min-h-0 lg:flex-row lg:gap-2 lg:overflow-hidden lg:pl-8"
        >
            <!-- sidebar -->
            <div
                class="w-full flex-shrink-0 lg:h-full lg:min-h-0 lg:w-[336px]"
                v-if="editableParent"
            >
                <div
                    class="scrollbar-hide lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-2 lg:pb-2 lg:pt-2"
                >
                    <div class="flex flex-col gap-[3px] pb-0 lg:gap-2 lg:pb-4">
                        <EditContentParent
                            v-if="editableParent"
                            :docType="props.docType"
                            :tagOrPostType="props.tagOrPostType"
                            :language="selectedLanguage"
                            :isParentDirty="isParentDirty"
                            :disabled="!canEditParent"
                            :newDocument="newDocument"
                            v-model:parent="editableParent"
                        >
                            <template #supplementary>
                                <!-- Image, media + video live inside the settings card. -->
                                <div class="mt-4 border-t border-zinc-200 pt-3">
                                    <div class="flex flex-col gap-1">
                                        <EditContentImage
                                            v-if="editableParent"
                                            embedded
                                            :docType="props.docType"
                                            :tagOrPostType="props.tagOrPostType"
                                            :disabled="!canEditParent"
                                            :newDocument="newDocument"
                                            v-model:parent="editableParent"
                                        />

                                        <div
                                            class="border-t border-zinc-200 pt-3"
                                            role="separator"
                                            aria-hidden="true"
                                        />

                                        <EditContentMedia
                                            v-if="editableParent"
                                            embedded
                                            :docType="props.docType"
                                            :tagOrPostType="props.tagOrPostType"
                                            :disabled="!canEditParent"
                                            :newDocument="newDocument"
                                            v-model:parent="editableParent"
                                        />

                                        <!-- light-polish: video sits with media in the
                                             settings card (the two merge later). -->
                                        <template v-if="selectedContent">
                                            <div
                                                class="border-t border-zinc-200 pt-3"
                                                role="separator"
                                                aria-hidden="true"
                                            />
                                            <EditContentVideo
                                                bare
                                                v-model:content="selectedContent"
                                                :disabled="!canTranslate"
                                            />
                                        </template>
                                    </div>
                                </div>
                            </template>
                        </EditContentParent>

                        <!-- Translations + the per-translation fields, merged into a single
                             "Basic" card (each child renders `bare`). Video lives in the
                             settings card above. -->
                        <LCard title="Basic" class="bg-white">
                            <EditContentParentValidation
                                bare
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
                                :isContentItemDirty="isContentItemDirty"
                                :existingContent="existingContent"
                                @updateIsValid="(val) => (isValid = val)"
                                @create-translation="(language) => createTranslation(language)"
                            />

                            <template v-if="selectedContent">
                                <div
                                    class="border-t border-zinc-200 pt-3"
                                    role="separator"
                                    aria-hidden="true"
                                />
                                <EditContentBasic
                                    bare
                                    v-model:content="selectedContent"
                                    :selectedLanguage="selectedLanguage!"
                                    :disabled="!canTranslate"
                                    :disable-publish="!canPublish"
                                />
                            </template>
                        </LCard>
                    </div>
                </div>
            </div>
            <!-- main content instance -->
            <div
                class="flex w-full min-w-0 flex-1 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden"
            >
                <div
                    class="flex w-full flex-1 flex-col bg-white lg:min-h-0 lg:overflow-hidden lg:border-l lg:border-zinc-200 lg:pr-8"
                >
                    <EmptyState
                        v-if="!selectedContent"
                        :icon="icon"
                        title="No translation"
                        description="Please select a language to start editing"
                        data-test="no-content"
                        class="mb-3 flex flex-col items-center justify-center lg:mb-0"
                    >
                        <div class="relative flex flex-col items-center lg:inline-block">
                            <LDropdown
                                v-model:show="showLanguageSelector"
                                placement="bottom-center"
                            >
                                <template #trigger>
                                    <LButton
                                        :icon="PlusIcon"
                                        class="h-max w-fit"
                                        variant="muted"
                                        data-test="add-translation-button"
                                        aria-label="Add translation"
                                    >
                                        <template #tooltip>Add a new translation</template>
                                    </LButton>
                                </template>
                                <div>
                                    <LanguageSelector
                                        data-test="language-selector"
                                        :parent="editableParent"
                                        :content="editableContent"
                                        :languages="untranslatedLanguages"
                                        v-model:show-selector="showLanguageSelector"
                                        @create-translation="createTranslation"
                                        placement="top-center"
                                    />
                                </div>
                            </LDropdown>
                        </div>
                    </EmptyState>
                    <EditContentText
                        v-else
                        v-model:content="selectedContent"
                        :selectedLanguage="selectedLanguage!"
                        :disabled="!canTranslate"
                        :disablePublish="!canPublish"
                        class="flex w-full flex-col lg:min-h-0 lg:flex-1"
                    />
                </div>
            </div>
        </div>
    </BasePage>

    <!-- modals -->
    <ConfirmBeforeLeavingModal :isDirty="isDirty && !editableParent?.deleteReq" />
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
        :showClosingButton="false"
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
    >
        <label
            class="mt-3 flex cursor-pointer select-none items-start gap-2 text-sm text-zinc-700"
            data-test="duplicate-image-toggle"
        >
            <input v-model="duplicateImageOnCopy" type="checkbox" class="mt-0.5 h-4 w-4" />
            <span>Duplicate image</span>
        </label>
    </LDialog>
</template>
