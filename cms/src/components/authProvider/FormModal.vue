<script setup lang="ts">
import type {
    AuthProviderConfigDto,
    AuthProviderDto,
    AuthProviderProviderConfig,
    GroupDto,
} from "luminary-shared";
import { computed, ref, toRaw, watch } from "vue";
import _ from "lodash";
import LModal from "../modals/LModal.vue";
import LDialog from "../common/LDialog.vue";
import LCombobox from "../forms/LCombobox.vue";
import FormErrors from "./FormErrors.vue";
import AuthConfig from "./AuthConfig.vue";
import LabelAndType from "./LabelAndType.vue";
import IconSection from "./IconSection.vue";
import Appearance from "./LabelAppearance.vue";
import UserFieldMappings from "./UserFieldMappings.vue";
import GroupMappings from "./GroupMappings.vue";
import FormActions from "./FormActions.vue";
import { validate, type Validation } from "@/components/content/ContentValidator";

const props = defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    /** Provider-level edit state from the parent's query (editable ≠ shadow). */
    providerIsEdited: boolean;
    /** Singleton AuthProviderConfig — read-only; staging is committed on save. */
    authProviderConfig: AuthProviderConfigDto | undefined;
}>();

const emit = defineEmits<{
    save: [payload: { stagingConfig: AuthProviderProviderConfig }];
    delete: [];
    duplicate: [payload: { stagingConfig: AuthProviderProviderConfig }];
    revert: [];
}>();

const isVisible = defineModel<boolean>("isVisible");
const provider = defineModel<AuthProviderDto | undefined>("provider");
const isDirty = defineModel<boolean>("isDirty", { default: false });
const hasAttemptedSubmit = defineModel<boolean>("hasAttemptedSubmit", { default: false });

const showDiscardConfirm = ref(false);

// Per-provider JWT config lives as an entry inside the shared AuthProviderConfig
// singleton (`singleton.providers[configId]`). We stage edits in a local deep
// clone so the singleton is never mutated while the modal is open: touching the
// singleton would mark it editable≠shadow, which blocks createEditable's server
// sync for every *other* provider's entry until the user saves. Staging is
// committed into the singleton at save time (via the emit payload) and never
// before. See useAuthProviders.spec for the sync-block regression this prevents.
const stagingProviderConfig = ref<AuthProviderProviderConfig>({});

function loadStagingConfigForCurrentProvider() {
    const p = provider.value;
    if (!p?.configId) {
        stagingProviderConfig.value = {};
        return;
    }
    const existing = props.authProviderConfig?.providers?.[p.configId];
    stagingProviderConfig.value = existing ? _.cloneDeep(toRaw(existing)) : {};
}

function stagingDiffersFromSingleton(): boolean {
    const p = provider.value;
    if (!p?.configId) return false;
    const sourceEntry = props.authProviderConfig?.providers?.[p.configId];
    return !_.isEqual(toRaw(stagingProviderConfig.value), sourceEntry ?? {});
}

// When the edited provider changes (modal opening or parent-driven switch),
// reload staging from the singleton — unless `prepareForDuplicate` has marked
// the next change as a duplicate, in which case we keep the user's in-progress
// staging so it carries over to the new clone.
let skipNextStagingReload = false;
watch(
    () => provider.value?._id,
    () => {
        if (skipNextStagingReload) {
            skipNextStagingReload = false;
            return;
        }
        loadStagingConfigForCurrentProvider();
    },
    { immediate: true },
);

// Imperative handoff for duplicate: parent calls this *before* flipping the
// v-model'd provider to the new clone, so the staging watcher skips its reload
// and the user's unsaved JWT edits follow them into the duplicate.
defineExpose({
    prepareForDuplicate() {
        skipNextStagingReload = true;
        hasAttemptedSubmit.value = false;
    },
});

const providerConfig = computed<AuthProviderProviderConfig | undefined>({
    get: () => stagingProviderConfig.value,
    set: (value) => {
        stagingProviderConfig.value = value ?? {};
    },
});

// ── Validation ──────────────────────────────────────────────────────────────
// Credential rules are intentionally provider-agnostic (not Auth0-only) since
// the auth layer is slated to accept other OIDC providers — see the note in
// cms/src/auth.ts clearAuth0Cache. Rules reject only values that clearly can't
// talk to *any* OIDC endpoint, not values that just look non-Auth0.

// RFC 1123-ish hostname: labels of [a-z0-9-] separated by dots, at least one
// dot (so bare "localhost" is rejected), no leading/trailing dash.
const HOSTNAME_RE =
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

function isValidDomain(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    // Reject scheme, path, port, query, fragment, or whitespace — domain
    // should be just the host. Catches paste of "https://tenant.auth0.com/".
    if (/[\s/:?#]/.test(trimmed)) return false;
    return HOSTNAME_RE.test(trimmed);
}

function isValidClientId(value: string): boolean {
    const trimmed = value.trim();
    // Auth0 uses 32 alphanumeric; other OIDC providers vary. 8 chars is a
    // "clearly not a typo" floor that still accepts every provider we've seen.
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
// Mirrors the logic that used to live in useAuthProviders: a provider is
// dirty when its editable doc diverges from the shadow (providerIsEdited,
// reported by the parent's query) OR when the staged JWT config differs
// from the singleton entry for this provider.
const isDirtyComputed = computed(
    () => props.providerIsEdited || stagingDiffersFromSingleton(),
);

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

// Writable proxy for the config entry's memberOf so LCombobox's v-model
// writes land on the defineModel-backed providerConfig object.
const configMemberOf = computed<string[]>({
    get: () => (providerConfig.value?.memberOf as string[] | undefined) ?? [],
    set: (value) => {
        if (!providerConfig.value) return;
        providerConfig.value = { ...providerConfig.value, memberOf: value };
    },
});

// Called by LModal before closing via backdrop, ESC, or X button
const beforeClose = (): boolean => {
    if (isDirty.value && props.isEditing) {
        showDiscardConfirm.value = true;
        return false;
    }
    return true;
};

// Called by the Cancel button in FormActions
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
    emit("save", { stagingConfig: _.cloneDeep(toRaw(stagingProviderConfig.value)) });
};

const handleDelete = () => {
    emit("delete");
};

const handleDuplicate = () => {
    emit("duplicate", { stagingConfig: _.cloneDeep(toRaw(stagingProviderConfig.value)) });
};

const handleRevert = () => {
    emit("revert");
    loadStagingConfigForCurrentProvider();
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

                <div
                    v-if="providerConfig"
                    class="rounded-md border border-zinc-200 bg-white p-2"
                >
                    <LCombobox
                        v-model:selected-options="configMemberOf"
                        :label="`Config Group Access`"
                        :options="groupOptions"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="isLoading"
                        data-test="configGroupSelector"
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
                <UserFieldMappings v-model:providerConfig="providerConfig" :disabled="isLoading" />

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
