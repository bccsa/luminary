<script setup lang="ts">
import { type AuthProviderDto, type GroupDto } from "luminary-shared";
import { computed, ref, watch } from "vue";
import LModal from "../modals/LModal.vue";
import LDialog from "../common/LDialog.vue";
import LCombobox from "../forms/LCombobox.vue";
import FormErrors from "./FormErrors.vue";
import AuthConfig from "./AuthConfig.vue";
import LabelAndType from "./LabelAndType.vue";
import IconSection from "./IconSection.vue";
import Appearance from "./LabelAppearance.vue";
import UserFieldMappings from "./UserFieldMappings.vue";
import FormActions from "./FormActions.vue";
import { validate, type Validation } from "@/components/content/ContentValidator";
const props = defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canEdit: boolean;
    canDelete: boolean;
    providerIsEdited: boolean;
}>();

const isDisabled = computed(() => props.isLoading || !props.canEdit);

const emit = defineEmits<{
    save: [];
    delete: [];
    duplicate: [];
    revert: [];
}>();

const isVisible = defineModel<boolean>("isVisible");
const provider = defineModel<AuthProviderDto | undefined>("provider");
const isDirty = defineModel<boolean>("isDirty", { default: false });
const hasAttemptedSubmit = defineModel<boolean>("hasAttemptedSubmit", { default: false });

const showDiscardConfirm = ref(false);

defineExpose({
    prepareForDuplicate() {
        hasAttemptedSubmit.value = false;
    },
});

// ── Validation ──────────────────────────────────────────────────────────────

const HOSTNAME_RE =
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

function isValidDomain(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/[\s/:?#]/.test(trimmed)) return false;
    return HOSTNAME_RE.test(trimmed);
}

function isValidClientId(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length < 8) return false;
    return !/\s/.test(trimmed);
}

function isValidAudience(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
        const url = new URL(trimmed);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

const providerValidations = ref<Validation[]>([]);

watch(
    [provider, hasAttemptedSubmit],
    ([p, attempted]) => {
        if (!p || !attempted) return;
        validate("Label is required", "label", providerValidations.value, p, (x) =>
            !!(x.label ?? "").trim(),
        );
        validate(
            "Domain must be a hostname like tenant.auth0.com (no https:// or path)",
            "domain",
            providerValidations.value,
            p,
            (x) => isValidDomain(x.domain ?? ""),
        );
        validate(
            "Client ID must be at least 8 characters and contain no whitespace",
            "clientId",
            providerValidations.value,
            p,
            (x) => isValidClientId(x.clientId ?? ""),
        );
        validate(
            "Audience must be an absolute URL (e.g. https://api.example.com)",
            "audience",
            providerValidations.value,
            p,
            (x) => isValidAudience(x.audience ?? ""),
        );
    },
    { deep: true },
);

const isFormValid = computed(() => {
    const p = provider.value;
    if (!p) return false;
    if (!(p.label ?? "").trim()) return false;
    return (
        isValidDomain(p.domain ?? "") &&
        isValidClientId(p.clientId ?? "") &&
        isValidAudience(p.audience ?? "")
    );
});

// ── Dirty tracking ──────────────────────────────────────────────────────────

const isDirtyComputed = computed(() => props.providerIsEdited);

watch(
    isDirtyComputed,
    (value) => {
        isDirty.value = value;
    },
    { immediate: true },
);

const groupOptions = computed(() =>
    props.availableGroups.map((group: GroupDto) => ({
        id: group._id,
        label: group.name,
        value: group._id,
    })),
);

const beforeClose = (): boolean => {
    if (isDirty.value && props.isEditing) {
        showDiscardConfirm.value = true;
        return false;
    }
    return true;
};

const closeModal = () => {
    if (isDirty.value && props.isEditing) {
        showDiscardConfirm.value = true;
    } else {
        isVisible.value = false;
    }
};

const discardAndClose = () => {
    showDiscardConfirm.value = false;
    emit("revert");
    isVisible.value = false;
};

const keepEditing = () => {
    showDiscardConfirm.value = false;
};

const handleSave = () => {
    hasAttemptedSubmit.value = true;
    emit("save");
};

const handleDelete = () => {
    emit("delete");
};

const handleDuplicate = () => {
    emit("duplicate");
};

const handleRevert = () => {
    emit("revert");
};
</script>

<template>
    <LModal
        v-model:isVisible="isVisible"
        large-modal
        stick-to-edges
        :heading="isEditing ? 'Edit Auth Provider' : 'Add Auth Provider'"
        :before-close="beforeClose"
    >
        <div
            ref="scrollContainer"
            class="mb-1 min-h-0 flex-1 overflow-auto md:flex md:gap-4 md:overflow-hidden"
        >
            <!-- Left column -->
            <div v-if="provider" class="space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <FormErrors :errors="errors ?? []" :validations="providerValidations" />

                <LabelAndType v-model:provider="provider" :disabled="isDisabled" />

                <div class="rounded-md border border-zinc-200 bg-white p-2">
                    <LCombobox
                        v-model:selected-options="provider.memberOf as string[]"
                        :label="`Group Membership`"
                        :options="groupOptions"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="isDisabled"
                        data-test="groupSelector"
                    />
                </div>

                <AuthConfig
                    v-model:provider="provider"
                    :is-editing="isEditing"
                    :disabled="isDisabled"
                />

                <IconSection
                    :provider="provider"
                    :disabled="isDisabled"
                    @update:icon-opacity="
                        (v) => {
                            if (provider) provider.iconOpacity = v;
                        }
                    "
                />

                <Appearance v-model:provider="provider" :disabled="isDisabled" />
            </div>

            <!-- Right column -->
            <div
                v-if="provider"
                class="mt-2 space-y-2 md:mt-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-l md:border-gray-200 md:pl-4"
            >
                <UserFieldMappings v-model:provider="provider" :disabled="isDisabled" />
            </div>
        </div>

        <FormActions
            :is-editing="isEditing"
            :is-loading="isLoading"
            :can-edit="canEdit"
            :can-delete="canDelete"
            :is-form-valid="isFormValid"
            :is-dirty="isDirty"
            @save="handleSave"
            @delete="handleDelete"
            @duplicate="handleDuplicate"
            @close="closeModal"
            @revert="handleRevert"
        />
    </LModal>

    <LDialog
        v-model:open="showDiscardConfirm"
        context="danger"
        title="Discard changes?"
        description="You have unsaved changes. If you close now, your changes will be discarded."
        primary-button-text="Discard changes"
        secondary-button-text="Keep editing"
        :primary-action="discardAndClose"
        :secondary-action="keepEditing"
        :show-closing-button="false"
    />
</template>
