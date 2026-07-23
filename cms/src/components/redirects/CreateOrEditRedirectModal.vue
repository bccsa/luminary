<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
    AclPermission,
    AckStatus,
    db,
    DocType,
    type RedirectDto,
    RedirectType,
    verifyAccess,
    type GroupDto,
    type Uuid,
    useHybridQuery,
    useSharedHybridQuery,
    toEditable,
    isConnected,
} from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import {
    CheckCircleIcon,
    ExclamationCircleIcon,
    ArrowUturnLeftIcon,
} from "@heroicons/vue/20/solid";
import { useNotificationStore } from "@/stores/notification";
import { Slug } from "@/util/slug";
import { TrashIcon } from "@heroicons/vue/24/outline";
import LDialog from "../common/LDialog.vue";
import LCombobox from "../forms/LCombobox.vue";

type Props = {
    isVisible: boolean;
    redirect?: RedirectDto;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();

const emit = defineEmits(["close"]);
const isNew = computed(() => !props.redirect);
const showDeleteModal = ref(false);
const isSaving = ref(false);

const currentId = ref<Uuid>(props.redirect?._id ?? db.uuid());

function createTemplate(id: Uuid): RedirectDto {
    return {
        _id: id,
        slug: "",
        redirectType: RedirectType.Permanent,
        memberOf: [],
        type: DocType.Redirect,
        updatedTimeUtc: Date.now(),
    };
}

const redirectSource = ref<RedirectDto[]>([]);

const liveRedirect = useHybridQuery<RedirectDto>(
    () =>
        props.redirect
            ? { selector: { type: DocType.Redirect, _id: props.redirect._id }, $limit: 1 }
            : { selector: { _id: { $in: [] } } },
    { live: true },
);

watch(
    liveRedirect,
    () => {
        if (liveRedirect.value.length) redirectSource.value = liveRedirect.value;
    },
    { immediate: true },
);

const redirectEditable = toEditable<RedirectDto>(redirectSource);
const { remove: removeRedirect, save: saveRedirect } = redirectEditable;

function hydrateFromRedirect(redirect: RedirectDto) {
    currentId.value = redirect._id;
    redirectSource.value = [redirect];
    redirectEditable.editable.value.splice(0, redirectEditable.editable.value.length, {
        ...redirect,
    });
    redirectEditable.updateShadow(redirect._id);
}

function seedCreateTemplate() {
    redirectEditable.editable.value.splice(
        0,
        redirectEditable.editable.value.length,
        createTemplate(currentId.value),
    );
}

const editable = computed<RedirectDto>({
    get: () => redirectEditable.editable.value[0],
    set: (val) => {
        const arr = redirectEditable.editable.value;
        if (arr.length === 0) arr.push(val);
        else arr.splice(0, 1, val);
    },
});

watch(
    () => props.redirect,
    (redirect) => {
        if (redirect) hydrateFromRedirect(redirect);
        else {
            currentId.value = db.uuid();
            redirectSource.value = [];
            seedCreateTemplate();
        }
    },
);

if (props.redirect) hydrateFromRedirect(props.redirect);
else seedCreateTemplate();

const isDirty = computed(() => {
    const doc = editable.value;
    if (!doc) return false;
    return redirectEditable.isEdited.value(doc._id);
});

const save = async () => {
    if (isSaving.value) return;
    const doc = editable.value;
    if (!doc) return;

    isSaving.value = true;
    try {
        doc.updatedTimeUtc = Date.now();
        const awaitServerAck = isConnected.value;
        const res = await saveRedirect(doc._id, { awaitAck: awaitServerAck });

        if (res?.ack !== AckStatus.Accepted) {
            addNotification({
                title: !isNew.value ? "Failed to update redirect" : "Failed to create redirect",
                description:
                    res?.message ??
                    "This redirect could not be saved — it may conflict with another redirect.",
                state: "error",
            });
            return;
        }

        addNotification(
            awaitServerAck
                ? {
                      title: !isNew.value ? `Redirect updated` : `Redirect created`,
                      description: `Redirecting ${doc.slug} to ${doc.toSlug ?? "HOMEPAGE"}`,
                      state: "success",
                  }
                : {
                      title: "Redirect saved offline",
                      description:
                          "The redirect is queued and will be checked by the server when you reconnect.",
                      state: "warning",
                  },
        );
        emit("close");
    } catch (error) {
        console.error("Error saving redirect:", error);
        addNotification({
            title: !isNew.value ? "Failed to update redirect" : "Failed to create redirect",
            description: error instanceof Error ? error.message : "An unknown error occurred",
            state: "error",
        });
    } finally {
        isSaving.value = false;
    }
};

const canSave = computed(() => {
    const doc = editable.value;
    if (!doc) return false;
    return (
        doc.slug?.trim() !== "" &&
        doc.memberOf.length > 0 &&
        !isSaving.value &&
        isDirty.value &&
        isSlugUnique.value == true
    );
});

const isTemporary = computed(() => {
    return editable.value?.redirectType == RedirectType.Temporary;
});

const redirectExplanation = computed(() => {
    return isTemporary.value
        ? "Temporary redirects are used for short-term changes. They are cached by browsers and search engines for a limited time."
        : "Permanent redirects are used for long-term changes. They are cached indefinitely by browsers and search engines.";
});

const isSlugUnique = ref(true);
const groups = useSharedHybridQuery<GroupDto>(() => ({ selector: { type: DocType.Group } }), {
    live: true,
});

watch(
    () => editable.value?.slug,
    async (slug) => {
        if (slug && slug.length > 0) {
            const slugIsUnique = await Slug.checkUnique(slug, editable.value._id, DocType.Redirect);
            isSlugUnique.value = slugIsUnique ? slugIsUnique : false;
        }
    },
);

const validateSlug = (slug: string | undefined) => {
    if (!slug) return undefined;
    return slug.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
};

const canDelete = computed(() => {
    const doc = editable.value;
    if (!doc) return false;
    return verifyAccess(doc.memberOf, DocType.Redirect, AclPermission.Delete, "all");
});

const deleteRedirect = async () => {
    if (isSaving.value) return;
    if (!canDelete.value) {
        addNotification({
            title: "Access denied",
            description: "You do not have permission to delete this redirect",
            state: "error",
        });
        return;
    }

    const doc = editable.value;
    if (!doc) return;

    isSaving.value = true;
    try {
        const awaitServerAck = isConnected.value;
        const res = await removeRedirect(doc._id, { awaitAck: awaitServerAck });
        if (res?.ack !== AckStatus.Accepted) {
            addNotification({
                title: "Failed to delete redirect",
                description:
                    res?.message ?? "The redirect could not be deleted — please try again.",
                state: "error",
            });
            return;
        }

        emit("close");
        addNotification(
            awaitServerAck
                ? {
                      title: `Redirect deleted`,
                      description: `The redirect was successfully deleted`,
                      state: "success",
                  }
                : {
                      title: "Redirect deletion saved offline",
                      description:
                          "The deletion is queued and will be checked by the server when you reconnect.",
                      state: "warning",
                  },
        );
    } catch (error) {
        console.error("Error deleting redirect:", error);
        addNotification({
            title: "Failed to delete redirect",
            description: error instanceof Error ? error.message : "An unknown error occurred",
            state: "error",
        });
    } finally {
        isSaving.value = false;
    }
};

const revertChanges = () => {
    redirectEditable.revert(currentId.value);
};
</script>

<template>
    <LDialog
        :open="isVisible"
        @update:open="(val: boolean | undefined) => !val && emit('close')"
        :title="!isNew ? 'Edit redirect' : 'Create new redirect'"
        @close="emit('close')"
        :primaryAction="() => save()"
        :primaryButtonText="isSaving ? 'Saving…' : !isNew ? 'Save' : 'Create'"
        :primaryButtonDisabled="!canSave"
        :secondaryAction="() => emit('close')"
        secondaryButtonText="Cancel"
        stickToEdges
    >
        <div v-if="editable" class="mb-2 flex flex-col items-center">
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

        <div v-if="editable" class="relative">
            <LInput
                label="From *"
                name="RedirectFromSlug"
                v-model="editable.slug"
                class="mb-4 w-full"
                placeholder="The slug that will be redirected from.."
                @change="editable.slug = validateSlug(editable.slug) || ''"
            />
            <span class="absolute left-12 top-1 flex text-xs text-red-400" v-if="!isSlugUnique"
                ><ExclamationCircleIcon class="h-4 w-4" /> This slug already has a redirect</span
            >
        </div>

        <LInput
            v-if="editable"
            label="To"
            name="RedirectToSlug"
            v-model="editable.toSlug"
            class="mb-4 w-full"
            placeholder="The slug that will be redirected to..."
            @change="editable.toSlug = validateSlug(editable.toSlug)"
        />

        <LCombobox
            v-if="editable"
            label="Group Membership"
            :options="
                groups.map((group: GroupDto) => ({
                    id: group._id,
                    label: group.name,
                    value: group._id,
                }))
            "
            :selectedOptions="editable.memberOf"
            placeholder="Select groups that can access this redirect"
            class="w-full"
            showIcon
            :disabled="false"
        />
        <template #footer-extra>
            <div class="flex gap-1">
                <LButton
                    v-if="!isNew"
                    variant="secondary"
                    context="danger"
                    data-test="delete"
                    :icon="TrashIcon"
                    @click="showDeleteModal = true"
                    :disabled="!canDelete"
                >
                    Delete
                </LButton>
                <LButton
                    type="button"
                    variant="secondary"
                    v-if="isDirty && !isNew"
                    @click="revertChanges"
                    :icon="ArrowUturnLeftIcon"
                >
                    Revert
                </LButton>
            </div>
        </template>
    </LDialog>

    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete redirect?`"
        :description="`Are you sure you want to delete this redirect? This action cannot be undone.`"
        :primaryAction="
            async () => {
                showDeleteModal = false;
                await deleteRedirect();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
        :showClosingButton="false"
    ></LDialog>
</template>
