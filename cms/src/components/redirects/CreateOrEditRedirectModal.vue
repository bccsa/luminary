<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
    AclPermission,
    db,
    DocType,
    type RedirectDto,
    RedirectType,
    verifyAccess,
} from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import _ from "lodash";
import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/vue/20/solid";
import { useNotificationStore } from "@/stores/notification";
import { Slug } from "@/util/slug";
import {
    PlusCircleIcon,
    FolderArrowDownIcon,
    ArrowUturnLeftIcon,
    TrashIcon,
} from "@heroicons/vue/24/solid";
import LDialog from "../common/LDialog.vue";

// Props for visibility and Redirect to edit
type Props = {
    isVisible: boolean;
    redirect?: RedirectDto;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();

const emit = defineEmits(["close"]);
const isNew = computed(() => !props.redirect);
const showDeleteModal = ref(false);

const editable = ref<RedirectDto>({
    _id: db.uuid(), // Generate new ID for create mode
    slug: "",
    redirectType: RedirectType.Permanent,
    memberOf: [],
    type: DocType.Redirect,
    updatedTimeUtc: Date.now(),
});

// Track the previous state for dirty checking
const previous = ref<RedirectDto>();

// Watch the passed `Redirect` prop to set the modal in edit mode
watch(
    () => props.redirect,
    (redirect) => {
        if (redirect) {
            editable.value = _.cloneDeep(redirect);
            previous.value = { ...redirect }; // Save the previous state for dirty checking
        } else {
            // Reset to a new Redirect if no Redirect is passed (create mode)
            editable.value = {
                _id: db.uuid(), // Generate new ID for create mode
                slug: "",
                redirectType: RedirectType.Permanent,
                memberOf: [],
                type: DocType.Redirect,
                updatedTimeUtc: Date.now(),
            };
        }
    },
    { immediate: true },
);

const save = async () => {
    // Bypass save if a new redirect is being deleted
    if (!(isNew.value && editable.value.deleteReq)) {
        editable.value.updatedTimeUtc = Date.now();
        await db.upsert({ doc: editable.value });
    }

    if (!editable.value.deleteReq) {
        useNotificationStore().addNotification({
            title: !isNew.value ? `Redirect updated` : `Redirect created`,
            description: `Redirecting ${editable.value.slug} to ${editable.value.toSlug ?? "HOMEPAGE"}`,
            state: "success",
        });
    }
    emit("close");
};

const isDirty = computed(() => {
    return !_.isEqual({ ...editable.value, updatedBy: "" }, { ...previous.value, updatedBy: "" });
});

const canSave = computed(() => {
    return (
        editable.value.slug?.trim() !== "" &&
        editable.value.memberOf.length > 0 &&
        isDirty.value &&
        isSlugUnique.value == true
    );
});

const isTemporary = computed(() => {
    return editable.value.redirectType == RedirectType.Temporary;
});

const redirectExplanation = computed(() => {
    return isTemporary.value
        ? "Temporary redirects are used for short-term changes. They are cached by browsers and search engines for a limited time."
        : "Permanent redirects are used for long-term changes. They are cached indefinitely by browsers and search engines.";
});

const isSlugUnique = ref(true);
watch(
    () => editable.value.slug,
    async () => {
        if (editable.value.slug.length > 0) {
            const slugIsUnique = await Slug.checkUnique(
                editable.value.slug,
                editable.value._id,
                DocType.Redirect,
            );
            isSlugUnique.value = slugIsUnique ? slugIsUnique : false;
        }
    },
);

const validateSlug = (slug: string | undefined) => {
    if (!slug) return undefined;
    return slug.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
};

// Redirect deletion
const canDelete = computed(() => {
    if (!editable.value) return false;
    return verifyAccess(editable.value.memberOf, DocType.Redirect, AclPermission.Delete, "all");
});

const deleteRedirect = () => {
    if (!canDelete.value) {
        addNotification({
            title: "Access denied",
            description: "You do not have permission to delete this redirect",
            state: "error",
        });
        return;
    }

    editable.value.deleteReq = 1;

    save();

    addNotification({
        title: `Redirect deleted`,
        description: `The redirect was successfully deleted`,
        state: "success",
    });
};
</script>

<template>
    <teleport to="body">
        <div
            v-if="isVisible"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            @click="isNew ? emit('close') : null"
        >
            <div class="w-96 rounded-lg bg-white p-6 shadow-lg" @click.stop>
                <!-- Dynamic title based on mode -->
                <h2 class="mb-4 text-xl font-bold">
                    {{ !isNew ? "Edit redirect" : "Create new redirect" }}
                </h2>

                <div class="mb-2 flex flex-col items-center">
                    <div class="mb-1 flex w-full gap-1">
                        <LButton
                            class="w-1/2"
                            :icon="isTemporary ? CheckCircleIcon : undefined"
                            @click="editable.redirectType = RedirectType.Temporary"
                            >Temporary
                        </LButton>
                        <LButton
                            class="w-1/2"
                            :icon="isTemporary ? undefined : CheckCircleIcon"
                            @click="editable.redirectType = RedirectType.Permanent"
                        >
                            Permanent
                        </LButton>
                    </div>
                    <p class="text-xs text-zinc-500">{{ redirectExplanation }}</p>
                </div>

                <div class="relative">
                    <LInput
                        label="From *"
                        name="RedirectFromSlug"
                        v-model="editable.slug"
                        class="mb-4 w-full"
                        placeholder="The slug that will be redirected from.."
                        @change="editable.slug = validateSlug(editable.slug) || ''"
                    />
                    <span
                        class="absolute left-12 top-1 flex text-xs text-red-400"
                        v-if="!isSlugUnique"
                        ><ExclamationCircleIcon class="h-4 w-4" /> This slug already has a
                        redirect</span
                    >
                </div>

                <LInput
                    label="To"
                    name="RedirectToSlug"
                    v-model="editable.toSlug"
                    class="mb-4 w-full"
                    placeholder="The slug that will be redirected to..."
                    @change="editable.toSlug = validateSlug(editable.toSlug)"
                />

                <GroupSelector
                    name="memberOf"
                    v-model:groups="editable.memberOf"
                    :docType="DocType.Redirect"
                />
                <div class="flex gap-4 pt-5">
                    <LButton
                        variant="secondary"
                        context="danger"
                        data-test="delete"
                        :icon="TrashIcon"
                        @click="showDeleteModal = true"
                        >Delete</LButton
                    >
                    <div class="flex-1" />
                    <LButton
                        variant="secondary"
                        data-test="cancel"
                        @click="emit('close')"
                        :icon="ArrowUturnLeftIcon"
                        >Cancel</LButton
                    >
                    <LButton
                        variant="primary"
                        data-test="save-button"
                        @click="save"
                        :disabled="!canSave"
                        :icon="!isNew ? FolderArrowDownIcon : PlusCircleIcon"
                    >
                        {{ !isNew ? "Save" : "Create" }}
                    </LButton>
                </div>
            </div>
        </div>
    </teleport>
    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete redirect?`"
        :description="`Are you sure you want to delete this redirect? This action cannot be undone.`"
        :primaryAction="
            () => {
                showDeleteModal = false;
                deleteRedirect();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>
</template>
