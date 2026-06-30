<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
    AclPermission,
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
    const doc = editable.value;
    if (!doc) return;

    if (!(isNew.value && doc.deleteReq)) {
        doc.updatedTimeUtc = Date.now();
        await redirectEditable.save(doc._id);
    }

    if (!doc.deleteReq) {
        useNotificationStore().addNotification({
            title: !isNew.value ? `Redirect updated` : `Redirect created`,
            description: `Redirecting ${doc.slug} to ${doc.toSlug ?? "HOMEPAGE"}`,
            state: "success",
        });
    }
    emit("close");
};

const canSave = computed(() => {
    const doc = editable.value;
    if (!doc) return false;
    return (
        doc.slug?.trim() !== "" &&
        doc.memberOf.length > 0 &&
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
        :primaryButtonText="!isNew ? 'Save' : 'Create'"
        :primaryButtonDisabled="!canSave"
        :secondaryAction="() => emit('close')"
        secondaryButtonText="Cancel"
        stickToEdges
    >
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
            <span class="absolute left-12 top-1 flex text-xs text-red-400" v-if="!isSlugUnique"
                ><ExclamationCircleIcon class="h-4 w-4" /> This slug already has a redirect</span
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

        <LCombobox
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
            () => {
                showDeleteModal = false;
                deleteRedirect();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
        :showClosingButton="false"
    ></LDialog>
</template>
