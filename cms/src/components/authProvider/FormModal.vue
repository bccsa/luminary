<script setup lang="ts">
import type { AuthProviderDto, AuthProviderProviderConfig, GroupDto } from "luminary-shared";
import { computed, ref } from "vue";
import LModal from "../modals/LModal.vue";
import LDialog from "../common/LDialog.vue";
import LCombobox from "../forms/LCombobox.vue";
import FormErrors from "./FormErrors.vue";
import AuthConfig from "./AuthConfig.vue";
import LabelAndType from "./LabelAndType.vue";
import IconSection from "./IconSection.vue";
import Appearance from "./Appearance.vue";
import UserFieldMappings from "./UserFieldMappings.vue";
import GroupMappings from "./GroupMappings.vue";
import FormActions from "./FormActions.vue";

const props = defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    isFormValid: boolean;
    isDirty: boolean;
    hasAttemptedSubmit: boolean;
    providerValidations?: { id: string; isValid: boolean; message: string }[];
}>();

const emit = defineEmits<{
    save: [];
    delete: [];
    duplicate: [];
    revert: [];
}>();

const isVisible = defineModel<boolean>("isVisible");
const provider = defineModel<AuthProviderDto | undefined>("provider");
const providerConfig = defineModel<AuthProviderProviderConfig | undefined>("providerConfig");

const showDiscardConfirm = ref(false);

const groupOptions = computed(() =>
    props.availableGroups.map((group: GroupDto) => ({
        id: group._id,
        label: group.name,
        value: group._id,
    })),
);

// Called by LModal before closing via backdrop, ESC, or X button
const beforeClose = (): boolean => {
    if (props.isDirty && props.isEditing) {
        showDiscardConfirm.value = true;
        return false;
    }
    return true;
};

// Called by the Cancel button in FormActions
const closeModal = () => {
    if (props.isDirty && props.isEditing) {
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

                <LabelAndType v-model:provider="provider" :disabled="isLoading" />

                <div class="rounded-md border border-zinc-200 bg-white p-2">
                    <LCombobox
                        v-model:selected-options="provider.memberOf as string[]"
                        :label="`Group Membership`"
                        :options="groupOptions"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="false"
                        data-test="groupSelector"
                    />
                </div>

                <AuthConfig
                    v-model:provider="provider"
                    :is-editing="isEditing"
                    :disabled="isLoading"
                />

                <IconSection
                    :provider="provider"
                    :disabled="isLoading"
                    @update:icon-opacity="
                        (v) => {
                            if (provider) provider.iconOpacity = v;
                        }
                    "
                />

                <Appearance v-model:provider="provider" :disabled="isLoading" />
            </div>

            <!-- Right column -->
            <div
                v-if="provider"
                class="mt-2 space-y-2 md:mt-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-l md:border-gray-200 md:pl-4"
            >
                <span class="text-md text-zinc-500"
                    >Automatically assign users to groups based on claims or attributes returned by
                    this authentication provider.</span
                >
                <UserFieldMappings
                    v-model:providerConfig="providerConfig"
                    :disabled="isLoading"
                />

                <GroupMappings
                    v-if="providerConfig"
                    v-model="providerConfig.groupMappings"
                    :available-groups="availableGroups"
                    :disabled="isLoading"
                />
            </div>
        </div>

        <FormActions
            :is-editing="isEditing"
            :is-loading="isLoading"
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
