<script setup lang="ts">
import { ref, computed } from "vue";
import { ArrowUpOnSquareIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import { type AuthProviderDto, type GroupDto } from "luminary-shared";

import LModal from "../modals/LModal.vue";
import AuthProviderGroupMappings from "./AuthProviderGroupMappings.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import ImageEditor from "../images/ImageEditor.vue";
import { XCircleIcon } from "@heroicons/vue/20/solid";
import { type ContentParentDto } from "luminary-shared";
import { storageSelection } from "@/composables/storageSelection";

defineProps<{
    isEditing: boolean;
    isLoading: boolean;
    errors: string[] | undefined;
    availableGroups: GroupDto[];
    canDelete: boolean;
    isFormValid: boolean;
    hasAttemptedSubmit: boolean;
}>();

const emit = defineEmits<{
    save: [];
    delete: [];
}>();

const isVisible = defineModel<boolean>("isVisible");
const provider = defineModel<AuthProviderDto | undefined>("provider");

// Image upload refs
const imageEditorRef = ref<InstanceType<typeof ImageEditor> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const storage = storageSelection();

// Check if bucket is selected
const isBucketSelected = computed(() => {
    return !!provider.value?.imageBucketId;
});

// Get the selected bucket's mimeTypes for the accept attribute
const acceptedMimeTypes = computed(() => {
    if (!provider.value?.imageBucketId) {
        return "image/jpeg, image/png, image/webp, image/svg+xml";
    }

    const bucket = storage.getBucketById(provider.value.imageBucketId);
    if (!bucket || !bucket.mimeTypes || bucket.mimeTypes.length === 0) {
        return "image/*";
    }

    return bucket.mimeTypes.join(", ");
});

const triggerFilePicker = () => {
    if (uploadInput.value) {
        uploadInput.value.value = "";
    }
    uploadInput.value?.showPicker();
};

const handleFileChange = () => {
    const files = uploadInput.value?.files;
    if (files?.length && imageEditorRef.value?.handleFiles) {
        imageEditorRef.value.handleFiles(files);
        uploadInput.value!.value = "";
    }
};

const closeModal = () => {
    isVisible.value = false;
};

const addClaimMapping = () => {
    if (!provider.value) return;
    if (!provider.value.claimMappings) {
        provider.value.claimMappings = [];
    }
    provider.value.claimMappings.push({ claim: "", target: "groups" });
};

const removeClaimMapping = (idx: number) => {
    if (!provider.value?.claimMappings) return;
    provider.value.claimMappings.splice(idx, 1);
};

function ensureUserFieldMappings() {
    if (!provider.value) return;
    if (!provider.value.userFieldMappings) {
        provider.value.userFieldMappings = {};
    }
}

/**
 * Strip protocol, trailing slashes, and paths so the domain is always
 * stored as a bare hostname (e.g. "your-tenant.auth0.com").
 */
const normalizeDomain = () => {
    if (!provider.value?.domain) return;
    let cleaned = provider.value.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");

    // Strip any leftover path segments
    if (cleaned.includes("/")) {
        try {
            cleaned = new URL(`https://${cleaned}`).hostname;
        } catch {
            // Not a valid URL — use as-is
        }
    }

    provider.value.domain = cleaned;
};

const handleSave = () => {
    emit("save");
};

const handleDelete = () => {
    emit("delete");
};
</script>

<template>
    <LModal
        v-model:isVisible="isVisible"
        large-modal
        :heading="isEditing ? 'Edit OAuth' : 'Add OAuth'"
    >
        <div
            ref="scrollContainer"
            class="max-h-[70vh] overflow-auto md:flex md:gap-4 md:overflow-hidden"
        >
            <!-- Left column: Label through Claim Namespace -->
            <div v-if="provider" class="space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <!-- Error display -->
                <div v-if="errors" class="mb-3">
                    <div
                        v-for="(error, idx) in errors"
                        :key="idx"
                        class="mb-1 flex items-center gap-2"
                    >
                        <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
                        <p class="text-xs text-zinc-700">{{ error }}</p>
                    </div>
                </div>

                <!-- Provider Label -->
                <div>
                    <label
                        for="provider-label"
                        class="mb-1 block text-xs font-medium text-gray-700"
                    >
                        Label <span class="text-red-500">*</span>
                    </label>
                    <LInput
                        id="provider-label"
                        name="providerLabel"
                        v-model="provider.label"
                        type="text"
                        placeholder="Production Auth0 or Development Auth0"
                    />
                </div>

                <!-- Provider Type (readonly for now, only Auth0 supported) -->
                <div>
                    <label class="mb-1 block text-xs font-medium text-gray-700"
                        >Provider Type</label
                    >
                    <div
                        class="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                    >
                        Auth0
                    </div>
                    <p class="mt-0.5 text-[11px] text-gray-500">
                        Currently only Auth0 is supported
                    </p>
                </div>

                <!-- Provider Icon -->
                <div>
                    <div class="mb-1 flex items-center justify-between">
                        <label class="block text-xs font-medium text-gray-700">Icon</label>
                        <LButton
                            v-if="isBucketSelected"
                            :icon="ArrowUpOnSquareIcon"
                            size="sm"
                            variant="tertiary"
                            :disabled="isLoading || !isBucketSelected"
                            @click.stop="triggerFilePicker"
                        >
                            Upload
                        </LButton>
                        <input
                            ref="uploadInput"
                            type="file"
                            class="hidden"
                            :accept="acceptedMimeTypes"
                            @change="handleFileChange"
                        />
                    </div>
                    <div class="rounded-md border border-gray-200 bg-white p-2">
                        <ImageEditor
                            ref="imageEditorRef"
                            v-model:parent="provider as unknown as ContentParentDto"
                            :disabled="isLoading"
                        />
                    </div>
                    <div class="mt-2">
                        <label
                            for="icon-opacity"
                            class="mb-1 block text-xs font-medium text-gray-700"
                        >
                            Icon transparency
                        </label>
                        <div class="flex items-center gap-2">
                            <input
                                id="icon-opacity"
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                :value="provider.iconOpacity ?? 1"
                                class="h-2 w-full flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-700"
                                :disabled="isLoading"
                                @input="
                                    (e) =>
                                        (provider!.iconOpacity = (
                                            e.target as HTMLInputElement
                                        ).valueAsNumber)
                                "
                            />
                            <span class="w-10 text-right text-xs text-gray-600">
                                {{ Math.round((provider.iconOpacity ?? 1) * 100) }}%
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Appearance -->
                <div class="rounded-md border border-zinc-200 bg-white p-2">
                    <h3 class="mb-2 text-sm font-medium text-gray-900">Appearance</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="mb-1 block text-xs font-medium text-gray-700"
                                >Text Color</label
                            >
                            <div class="flex items-center gap-2">
                                <div
                                    class="relative h-[38px] w-[38px] flex-shrink-0 overflow-hidden rounded-md border border-gray-300"
                                >
                                    <input
                                        type="color"
                                        :value="provider.textColor || '#000000'"
                                        @input="
                                            (e) =>
                                                (provider!.textColor = (
                                                    e.target as HTMLInputElement
                                                ).value)
                                        "
                                        class="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                                        :disabled="isLoading"
                                    />
                                    <div
                                        class="h-full w-full"
                                        :style="{
                                            backgroundColor: provider.textColor || '#000000',
                                        }"
                                    ></div>
                                </div>
                                <LInput
                                    id="textColor"
                                    name="textColor"
                                    v-model="provider.textColor"
                                    type="text"
                                    placeholder="#000000"
                                    :disabled="isLoading"
                                />
                            </div>
                        </div>
                        <div>
                            <label class="mb-1 block text-xs font-medium text-gray-700"
                                >Background Color</label
                            >
                            <div class="flex items-center gap-2">
                                <div
                                    class="relative h-[38px] w-[38px] flex-shrink-0 overflow-hidden rounded-md border border-gray-300"
                                >
                                    <input
                                        type="color"
                                        :value="provider.backgroundColor || '#ffffff'"
                                        @input="
                                            (e) =>
                                                (provider!.backgroundColor = (
                                                    e.target as HTMLInputElement
                                                ).value)
                                        "
                                        class="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                                        :disabled="isLoading"
                                    />
                                    <div
                                        class="h-full w-full"
                                        :style="{
                                            backgroundColor: provider.backgroundColor || '#ffffff',
                                        }"
                                    ></div>
                                </div>
                                <LInput
                                    id="backgroundColor"
                                    name="backgroundColor"
                                    v-model="provider.backgroundColor"
                                    type="text"
                                    placeholder="#FFFFFF"
                                    :disabled="isLoading"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Group Membership -->
                <div>
                    <LCombobox
                        v-model:selected-options="provider.memberOf as string[]"
                        :label="`Group Membership`"
                        :options="
                            availableGroups.map((group: GroupDto) => ({
                                id: group._id,
                                label: group.name,
                                value: group._id,
                            }))
                        "
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="true"
                        :disabled="false"
                        data-test="groupSelector"
                    />
                </div>

                <!-- Auth0 Credentials -->
                <div class="border-t pt-2">
                    <div class="mb-2 flex items-center justify-between">
                        <h3 class="text-sm font-medium text-gray-900">Auth0 Configuration</h3>
                    </div>

                    <div class="space-y-2">
                        <!-- Domain -->
                        <div>
                            <label
                                for="domain"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Domain
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="domain"
                                name="domain"
                                v-model="provider.domain"
                                type="text"
                                placeholder="your-tenant.auth0.com"
                                :disabled="isLoading"
                                :required="!isEditing"
                                @blur="normalizeDomain"
                            />
                        </div>

                        <!-- Client ID -->
                        <div>
                            <label
                                for="clientId"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Client ID
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="clientId"
                                name="clientId"
                                v-model="provider.clientId"
                                type="text"
                                placeholder="Your Auth0 Client ID"
                                :disabled="isLoading"
                                :required="!isEditing"
                            />
                        </div>

                        <!-- Audience -->
                        <div>
                            <label
                                for="audience"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Audience
                                <span v-if="!isEditing" class="text-red-500">*</span>
                            </label>
                            <LInput
                                id="audience"
                                name="audience"
                                v-model="provider.audience"
                                type="text"
                                placeholder="https://your-api.example.com"
                                :disabled="isLoading"
                                :required="!isEditing"
                            />
                            <p class="mt-0.5 text-[11px] text-gray-500">
                                The API identifier/audience configured in Auth0
                            </p>
                        </div>

                        <!-- Claim Namespace -->
                        <div>
                            <label
                                for="claimNamespace"
                                class="mb-1 block text-xs font-medium text-gray-700"
                            >
                                Claim Namespace
                            </label>
                            <LInput
                                id="claimNamespace"
                                name="claimNamespace"
                                v-model="provider.claimNamespace"
                                type="text"
                                placeholder="https://your-tenant.com/metadata"
                                :disabled="isLoading"
                            />
                            <p class="mt-0.5 text-[11px] text-gray-500">
                                The custom claim namespace configured in your Auth0 tenant's
                                Actions/Rules
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right column: User field names, Claim Mappings, Group mappings (desktop only) -->
            <div
                v-if="provider"
                class="mt-2 space-y-2 md:mt-0 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-l md:border-gray-200 md:pl-4"
            >
                <!-- User field mappings (keys inside claimNamespace) -->
                <div class="rounded-md border border-zinc-200 bg-white p-2">
                    <h4 class="mb-2 text-xs font-medium text-gray-900">
                        User field names (inside claim namespace)
                    </h4>
                    <p class="mb-2 text-[11px] text-gray-500">
                        Optional. Field names for userId, email, name under the claim namespace
                        (e.g. userId, email, username).
                    </p>
                    <div class="grid grid-cols-3 gap-2">
                        <div>
                            <label
                                for="userFieldUserId"
                                class="mb-0.5 block text-[11px] text-gray-600"
                                >userId</label
                            >
                            <LInput
                                id="userFieldUserId"
                                name="userFieldUserId"
                                :value="provider.userFieldMappings?.['userId'] ?? ''"
                                type="text"
                                placeholder="userId"
                                :disabled="isLoading"
                                @input="
                                    ensureUserFieldMappings();
                                    if (($event.target as HTMLInputElement).value) {
                                        provider!.userFieldMappings!['userId'] = (
                                            $event.target as HTMLInputElement
                                        ).value;
                                    } else {
                                        delete provider!.userFieldMappings!['userId'];
                                    }
                                "
                            />
                        </div>
                        <div>
                            <label
                                for="userFieldEmail"
                                class="mb-0.5 block text-[11px] text-gray-600"
                                >email</label
                            >
                            <LInput
                                id="userFieldEmail"
                                name="userFieldEmail"
                                :value="provider.userFieldMappings?.['email'] ?? ''"
                                type="text"
                                placeholder="email"
                                :disabled="isLoading"
                                @input="
                                    ensureUserFieldMappings();
                                    if (($event.target as HTMLInputElement).value) {
                                        provider!.userFieldMappings!['email'] = (
                                            $event.target as HTMLInputElement
                                        ).value;
                                    } else {
                                        delete provider!.userFieldMappings!['email'];
                                    }
                                "
                            />
                        </div>
                        <div>
                            <label
                                for="userFieldName"
                                class="mb-0.5 block text-[11px] text-gray-600"
                                >name</label
                            >
                            <LInput
                                id="userFieldName"
                                name="userFieldName"
                                :value="provider.userFieldMappings?.['name'] ?? ''"
                                type="text"
                                placeholder="username"
                                :disabled="isLoading"
                                @input="
                                    ensureUserFieldMappings();
                                    if (($event.target as HTMLInputElement).value) {
                                        provider!.userFieldMappings!['name'] = (
                                            $event.target as HTMLInputElement
                                        ).value;
                                    } else {
                                        delete provider!.userFieldMappings!['name'];
                                    }
                                "
                            />
                        </div>
                    </div>
                </div>

                <!-- Claim Mappings -->
                <div>
                    <div class="mb-1 flex items-center justify-between">
                        <label class="block text-xs font-medium text-gray-700">
                            Claim Mappings
                        </label>
                        <LButton
                            size="sm"
                            variant="tertiary"
                            :disabled="isLoading"
                            @click="addClaimMapping"
                        >
                            + Add
                        </LButton>
                    </div>
                    <p class="mb-2 text-[11px] text-gray-500">
                        Map JWT claim fields to system concepts (e.g. map a "hasMembership" claim to
                        "groups")
                    </p>
                    <div
                        v-for="(mapping, idx) in provider.claimMappings ?? []"
                        :key="idx"
                        class="mb-2 flex items-center gap-2"
                    >
                        <LInput
                            :name="`claimMapping-claim-${idx}`"
                            v-model="mapping.claim"
                            type="text"
                            placeholder="groups"
                            :disabled="isLoading"
                            class="flex-1"
                        />
                        <span class="text-xs text-gray-400">→</span>
                        <select
                            v-model="mapping.target"
                            :disabled="isLoading"
                            class="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
                        >
                            <option value="groups">groups</option>
                        </select>
                        <button
                            type="button"
                            class="text-gray-400 hover:text-red-500"
                            :disabled="isLoading"
                            @click="removeClaimMapping(idx)"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <!-- Group mappings: Assign [group] if [condition1] and [condition2] -->
                <AuthProviderGroupMappings
                    v-model="provider.groupMappings"
                    :available-groups="availableGroups"
                    :disabled="isLoading"
                />
            </div>
        </div>

        <!-- Actions buttons -->
        <div class="flex justify-between border-t pt-3">
            <div>
                <LButton
                    v-if="isEditing && canDelete"
                    @click="handleDelete"
                    variant="secondary"
                    context="danger"
                    size="sm"
                    :disabled="isLoading"
                >
                    Delete
                </LButton>
            </div>
            <div class="flex gap-2">
                <LButton @click="closeModal" variant="secondary" size="sm" :disabled="isLoading">
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    size="sm"
                    @click="handleSave"
                    :disabled="isLoading || !isFormValid"
                    :loading="isLoading"
                >
                    {{ isEditing ? "Update" : "Create" }}
                </LButton>
            </div>
        </div>
    </LModal>
</template>
