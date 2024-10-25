<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { db, DocType, RedirectType, type RedirectDto } from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import * as _ from "lodash";

// Props for visibility and language to edit
type Props = {
    isVisible: boolean;
    redirect?: RedirectDto;
};
const props = defineProps<Props>();

// Track the previous state for dirty checking
const previousRedirect = ref<RedirectDto | null>(null);

// Emit events to close the modal and trigger creation or update
const emit = defineEmits(["close", "created", "updated"]);

// Check if we are in edit mode (if a language is passed)
const isEditMode = computed(() => !!props.redirect);

// New language or edited language object
const newRedirect = ref<RedirectDto>({
    _id: db.uuid(), // Generate new ID for create mode
    fromSlug: "",
    toSlug: "",
    toUrl: "",
    redirectType: RedirectType.Temporary,
    memberOf: [],
    type: DocType.Redirect,
    updatedTimeUtc: Date.now(),
});

// Watch the passed `language` prop to set the modal in edit mode
watch(
    () => props.redirect,
    (newRedirectDoc) => {
        if (newRedirectDoc) {
            newRedirect.value = { ...newRedirectDoc };
            previousRedirect.value = _.cloneDeep(newRedirect.value); // Clone the language for dirty checking
        } else {
            // Reset to a new language if no language is passed (create mode)
            newRedirect.value = {
                _id: db.uuid(), // Generate new ID for create mode
                fromSlug: "",
                toSlug: "",
                toUrl: "",
                redirectType: RedirectType.Temporary,
                memberOf: [],
                type: DocType.Redirect,
                updatedTimeUtc: Date.now(),
            };
            previousRedirect.value = null; // Reset previous state for new language
        }
    },
    { immediate: true },
);

// Function to handle creation or update
const saveRedirect = async () => {
    // Update the timestamp
    newRedirect.value.updatedTimeUtc = Date.now();

    // Deep clone the `memberOf` array to avoid DataCloneError
    const clonedRedirect = {
        ...newRedirect.value,
        memberOf: [...newRedirect.value.memberOf],
    };

    // Save the cloned language object to the database
    await db.upsert(clonedRedirect);

    if (isEditMode.value) {
        emit("updated", clonedRedirect); // Emit update event if editing
    } else {
        emit("created", clonedRedirect); // Emit create event if creating
    }

    emit("close");
};

// Dirty checking logic
const isDirty = computed(() => {
    return validateForm(); // Always validate fields in create mode
});

// Form validation to check if all fields are filled
const validateForm = () => {
    return newRedirect.value.fromSlug.trim() !== "";
};
</script>

<template>
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
        <div class="w-96 rounded-lg bg-white p-6 shadow-lg">
            <!-- Dynamic title based on mode -->
            <h2 class="mb-4 text-xl font-bold">
                {{ isEditMode ? "Edit Redirect" : "Create New Redirect" }}
            </h2>

            <LInput
                label="From"
                name="redirectFromSlug"
                v-model="newRedirect.fromSlug"
                class="mb-4 w-full"
                placeholder="Enter language name"
            />

            <LInput
                label="To"
                name="languageCode"
                v-model="newRedirect.toUrl"
                class="mb-4 w-full"
                placeholder="Enter language code"
            />

            <GroupSelector
                name="memberOf"
                v-model:groups="newRedirect.memberOf"
                :docType="DocType.Language"
            />

            <div class="flex justify-end gap-4 pt-5">
                <LButton variant="secondary" data-test="cancel" @click="emit('close')"
                    >Cancel</LButton
                >
                <LButton
                    variant="primary"
                    data-test="save-button"
                    @click="saveRedirect"
                    :disabled="!isDirty"
                >
                    {{ isEditMode ? "Save Changes" : "Create" }}
                </LButton>
            </div>
        </div>
    </div>
</template>
