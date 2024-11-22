<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    verifyAccess,
    type LanguageDto,
} from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import GroupSelector from "@/components/groups/GroupSelector.vue";
import _ from "lodash";
import LToggle from "@/components/forms/LToggle.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import { useNotificationStore } from "@/stores/notification";

// Props for visibility and language to edit
type Props = {
    isVisible: boolean;
    language?: LanguageDto;
};
const props = defineProps<Props>();

// Emit events to close the modal and trigger creation or update
const emit = defineEmits(["close"]);

// Check if we are in edit mode (if a language is passed)
const isEditMode = computed(() => !!props.language);

// New language or edited language object
const editable = ref<LanguageDto>(
    props.language
        ? _.cloneDeep(props.language)
        : {
              _id: db.uuid(), // Generate new ID for create mode
              name: "",
              languageCode: "",
              default: 0,
              memberOf: [],
              type: DocType.Language,
              updatedTimeUtc: Date.now(),
          },
);

// Change to ref
const canEditOrCreate = computed(() => {
    if (props.language) {
        return verifyAccess(props.language.memberOf, DocType.Language, AclPermission.Edit, "all");
    }
    return hasAnyPermission(DocType.Language, AclPermission.Edit);
});

// Convert the default value to a boolean for the toggle
const isDefault = ref(editable.value.default == 1 ? true : false);
watch(isDefault, (newValue) => {
    editable.value.default = newValue ? 1 : 0;
});

const save = async () => {
    editable.value.updatedTimeUtc = Date.now();
    await db.upsert(editable.value);

    if (!isEditMode.value) {
        useNotificationStore().addNotification({
            title: `Language created`,
            description: `The new language "${editable.value.name}" has been created successfully`,
            state: "success",
        });
    }

    emit("close");
};

// Form validation to check if all fields are filled
const isValidated = computed(
    () =>
        editable.value.name.trim() !== "" &&
        editable.value.languageCode.trim() !== "" &&
        editable.value.memberOf.length > 0,
);
</script>

<template>
    <div
        v-if="isVisible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    >
        <div class="w-96 rounded-lg bg-white p-6 shadow-lg">
            <h2 class="mb-4 text-xl font-bold">
                {{ isEditMode ? "Edit language" : "Create new language" }}
            </h2>

            <LInput
                label="Name"
                name="languageName"
                v-model="editable.name"
                class="mb-4 w-full"
                placeholder="Enter language name"
                :disabled="!canEditOrCreate"
            />

            <LInput
                label="Code"
                name="languageCode"
                v-model="editable.languageCode"
                class="mb-4 w-full"
                placeholder="Enter language code"
                :disabled="!canEditOrCreate"
            />

            <GroupSelector
                v-model:groups="editable.memberOf"
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
                    v-model:model-value="isDefault"
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
                    @click="save"
                    :disabled="!isValidated"
                >
                    {{ isEditMode ? "Save Changes" : "Create" }}
                </LButton>
            </div>
        </div>
    </div>
</template>
