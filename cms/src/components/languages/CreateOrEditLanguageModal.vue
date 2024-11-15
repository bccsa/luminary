<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { AclPermission, db, DocType, hasAnyPermission, type LanguageDto } from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import * as _ from "lodash";
import LToggle from "../forms/LToggle.vue";
import FormLabel from "../forms/FormLabel.vue";

// Props for visibility and language to edit
type Props = {
    isVisible: boolean;
    language?: LanguageDto;
};
const props = defineProps<Props>();

// Track the previous state for dirty checking
const previousLanguage = ref<LanguageDto | null>(null);

// Emit events to close the modal and trigger creation or update
const emit = defineEmits(["close", "created", "updated"]);

// Check if we are in edit mode (if a language is passed)
const isEditMode = computed(() => !!props.language);

// New language or edited language object
const newLanguage = ref<LanguageDto>({
    _id: db.uuid(), // Generate new ID for create mode
    name: "",
    languageCode: "",
    default: 0,
    memberOf: [],
    type: DocType.Language,
    updatedTimeUtc: Date.now(),
});

let previousDefaultValueForCurrentLanguage = ref<number>(newLanguage.value.default!);

const canEditOrCreate =
    hasAnyPermission(DocType.Language, AclPermission.Edit) ||
    hasAnyPermission(DocType.Language, AclPermission.Publish);

// Watch the passed `language` prop to set the modal in edit mode
watch(
    () => props.language,
    (newLang) => {
        if (newLang) {
            newLanguage.value = { ...newLang };
            previousLanguage.value = _.cloneDeep(newLang); // Clone the language for dirty checking
            previousDefaultValueForCurrentLanguage.value = previousLanguage.value.default!;
        } else {
            // Reset to a new language if no language is passed (create mode)
            newLanguage.value = {
                _id: db.uuid(),
                name: "",
                languageCode: "",
                default: 0,
                memberOf: [],
                type: DocType.Language,
                updatedTimeUtc: Date.now(),
            };
            previousLanguage.value = null; // Reset previous state for new language
        }
    },
    { immediate: true },
);

const allLanguages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const isNewLanguageDefault = ref(newLanguage.value.default === 0 ? false : true);

watch(isNewLanguageDefault, (newValue) => {
    if (!newValue) {
        newLanguage.value.default = 0;
        return;
    } else {
        newLanguage.value.default! = 1;
    }
});

const saveLanguage = async () => {
    // Update the timestamp
    newLanguage.value.updatedTimeUtc = Date.now();

    // Deep clone the `memberOf` array to avoid DataCloneError
    const clonedLanguage = {
        ...newLanguage.value,
        memberOf: [...newLanguage.value.memberOf],
    };

    if (newLanguage.value.default === 1) {
        // Set other languages' `default` to false if the current language is set as default
        const updateLanguages = allLanguages.value
            .filter((language) => language._id !== newLanguage.value._id && language.default === 1)
            .map((language) => {
                return db.upsert({
                    ...language,
                    memberOf: [...newLanguage.value.memberOf],
                    default: 0,
                });
            });

        // Wait for all updates to complete before saving the current language
        await Promise.all(updateLanguages);
    }

    // Save the cloned language object to the database
    await db.upsert(clonedLanguage);

    if (isEditMode.value) {
        emit("updated", clonedLanguage); // Emit update event if editing
    } else {
        emit("created", clonedLanguage); // Emit create event if creating
    }

    emit("close");
};

// Dirty checking logic
const isDirty = computed(() => {
    return validateForm(); // Always validate fields in create mode
});

// Form validation to check if all fields are filled
const validateForm = () => {
    return (
        newLanguage.value.name.trim() !== "" &&
        newLanguage.value.languageCode.trim() !== "" &&
        newLanguage.value.memberOf.length > 0
    );
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
                {{ isEditMode ? "Edit language" : "Create new language" }}
            </h2>

            <LInput
                label="Name"
                name="languageName"
                v-model="newLanguage.name"
                class="mb-4 w-full"
                placeholder="Enter language name"
                :disabled="!canEditOrCreate"
            />

            <LInput
                label="Code"
                name="languageCode"
                v-model="newLanguage.languageCode"
                class="mb-4 w-full"
                placeholder="Enter language code"
                :disabled="!canEditOrCreate"
            />

            <GroupSelector
                v-model:groups="newLanguage.memberOf"
                :docType="DocType.Language"
                data-test="group-selector"
                :disabled="!canEditOrCreate"
            />

            <div class="mt-2 flex items-center justify-between">
                <FormLabel for="is-language-default-toggle" class="flex items-center">
                    Default Language?
                </FormLabel>
                <LToggle
                    name="is-language-default-toggle"
                    v-model:model-value="isNewLanguageDefault"
                    :disabled="!canEditOrCreate"
                />
            </div>

            <div class="flex justify-end gap-4 pt-5">
                <LButton variant="secondary" data-test="cancel" @click="emit('close')"
                    >Cancel</LButton
                >
                <LButton
                    variant="primary"
                    data-test="save-button"
                    @click="saveLanguage"
                    :disabled="!isDirty"
                >
                    {{ isEditMode ? "Save Changes" : "Create" }}
                </LButton>
            </div>
        </div>
    </div>
</template>
