<script setup lang="ts">
import { ref, computed, watch, toRaw } from "vue";
import {
    AclPermission,
    db,
    DocType,
    type RedirectDto,
    RedirectType,
    verifyAccess,
    type GroupDto,
    type ApiSearchQuery,
    useDexieLiveQuery,
    ApiLiveQuery,
} from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import _ from "lodash";
import {
    CheckCircleIcon,
    ExclamationCircleIcon,
    ArrowUturnLeftIcon,
} from "@heroicons/vue/20/solid";
import { useNotificationStore } from "@/stores/notification";
import { Slug } from "@/util/slug";
import { TrashIcon } from "@heroicons/vue/24/solid";
import LDialog from "../common/LDialog.vue";
import LCombobox from "../forms/LCombobox.vue";

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

const revertChanges = () => {
    editable.value = _.cloneDeep(original.value) as RedirectDto;
};

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

const redirectQuery = ref<ApiSearchQuery>({
    types: [DocType.Redirect],
    docId: props.redirect ? props.redirect._id : undefined,
});
const apiLiveQuery = new ApiLiveQuery<RedirectDto>(redirectQuery);
const original = apiLiveQuery.toRef();

const isDirty = ref(false);
watch(
    [editable, original],
    () => {
        if (!original.value) {
            isDirty.value = true;
            return;
        }
        isDirty.value = !_.isEqual(
            { ...toRaw(original.value), updatedTimeUtc: 0, _rev: "" },
            { ...toRaw(editable.value), updatedTimeUtc: 0, _rev: "" },
        );
    },
    { deep: true, immediate: true },
);

const redirectExplanation = computed(() => {
    return isTemporary.value
        ? "Temporary redirects are used for short-term changes. They are cached by browsers and search engines for a limited time."
        : "Permanent redirects are used for long-term changes. They are cached indefinitely by browsers and search engines.";
});

const isSlugUnique = ref(true);
const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

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
    <LDialog
        :isVisible="isVisible"
        :title="!isNew ? 'Edit redirect' : 'Create new redirect'"
        @close="emit('close')"
        :primaryAction="
            () => {
                save(), emit('close');
            }
        "
        :primaryButtonText="!isNew ? 'Save' : 'Create'"
        :primaryButtonDisabled="!canSave"
        :secondaryAction="() => emit('close')"
        secondaryButtonText="cancel"
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
            :showIcon="true"
            :disabled="false"
        />
        <template #footer-left>
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
    ></LDialog>
</template>
