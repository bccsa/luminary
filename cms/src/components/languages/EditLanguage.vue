<script setup lang="ts">
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    useDexieLiveQuery,
    verifyAccess,
    type LanguageDto,
    type Uuid,
} from "luminary-shared";
import { ref, computed, watch, toRaw } from "vue";
import LInput from "../forms/LInput.vue";
import LButton from "../button/LButton.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import LToggle from "../forms/LToggle.vue";
import BasePage from "../BasePage.vue";
import LBadge from "../common/LBadge.vue";
import LCard from "../common/LCard.vue";
import FormLabel from "../forms/FormLabel.vue";
import LSelect from "../forms/LSelect.vue";
import { useNotificationStore } from "@/stores/notification";
import _ from "lodash";

type Props = {
    id: Uuid;
};
const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const isLocalChange = db.isLocalChangeAsRef(props.id);

const original = useDexieLiveQuery(
    () => db.docs.where("_id").equals(props.id).first() as unknown as Promise<LanguageDto>,
);
const editable = ref<LanguageDto>({
    _id: props.id,
    name: "New language",
    languageCode: "xx",
    default: 0,
    memberOf: [],
    type: DocType.Language,
    updatedTimeUtc: Date.now(),
    translations: {},
});

// Clone the original language when it's loaded into the editable object
const originalLoadedHandler = watch(original, () => {
    if (!original.value) return;
    editable.value = _.cloneDeep(original.value);
    originalLoadedHandler();
});

// Check if the language is dirty (has unsaved changes)
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

const isNew = computed(() => !original.value?._id);

// Revert to the initial state
const revertChanges = () => {
    if (!original.value) return;
    editable.value = _.cloneDeep(original.value);

    useNotificationStore().addNotification({
        title: "Changes reverted",
        description: `The changes of the ${editable.value.name} have been reverted`,
        state: "success",
    });
};

const keyInput = ref(""); // Holds the key being edited or added
const valueInput = ref(""); // Holds the value for the key being edited or added
const newKey = ref<string>(""); // Temporary variable for editing the key

const comparisonLanguage = ref<Uuid>(editable.value ? editable.value._id : "");
const selectedLanguageContent = ref<LanguageDto>();

const languageOptions = computed(() =>
    languages.value.map((l) => ({ value: l._id, label: l.name })),
);

// Sort translations by key before rendering
const sortedTranslations = computed(() => {
    if (editable.value?.translations) {
        const sortedKeys = Object.keys(editable.value.translations).sort();
        return sortedKeys.reduce(
            (acc, key) => {
                acc[key] = editable.value.translations[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    }
    return {};
});

const canEditOrCreate = computed(() => {
    if (editable.value) {
        return verifyAccess(editable.value.memberOf, DocType.Language, AclPermission.Edit, "all");
    }
    return hasAnyPermission(DocType.Language, AclPermission.Edit);
});

const disabled = computed(() => {
    return !canEditOrCreate.value || (!keyInput.value && !valueInput.value);
});

// Add a new translation key-value pair
const addProperty = () => {
    try {
        // Add or update the property directly in the translations object
        editable.value.translations = {
            ...editable.value.translations, // Keep existing translations
            [keyInput.value]: valueInput.value, // Add new property
        };

        keyInput.value = "";
        valueInput.value = "";
    } catch (error) {
        alert(error);
    }
};

// Delete a translation key
const deleteProperty = (key: string) => {
    try {
        delete editable.value.translations[key];
    } catch (error) {
        alert(error);
    }
};

const editingKey = ref<string | null>(null); // To track which key is being edited
const editingValue = ref<string>(""); // To hold the value of the key being edited

// Function to start editing a translation value
const startEditing = (key: string, value: string) => {
    editingKey.value = key;
    newKey.value = key;
    editingValue.value = value;
    // if (value) editingValue.value = value;
};

// Save the edited key and value
// TODO - change to auto-save
const saveEditedKeyValue = () => {
    if (editingKey.value && newKey.value) {
        // Update the translations object with the new key and value
        editable.value.translations = {
            ...editable.value.translations,
            [newKey.value]: editingValue.value,
        };

        // Remove the old key if it was changed
        if (editingKey.value !== newKey.value) {
            delete editable.value.translations[editingKey.value];
        }
    }

    // Reset editing states
    editingKey.value = null;
    newKey.value = "";
    editingValue.value = "";
};

// Function to replace translations in other languages
// TODO: Move this logic to the API. User needs edit access to all languages to be able to add or remove keys.
const updateTranslationsInOtherLanguages = () => {
    if (editable.value?.translations) {
        languages.value.forEach((language) => {
            // Skip the current language
            if (language._id === editable.value._id) return;

            if (language.translations) {
                // Merge current language's translations into other languages' translations
                Object.keys(editable.value.translations).forEach((key) => {
                    // Only update the translation if it's not already set in the target language
                    if (!language.translations[key]) {
                        language.translations[key] = "";
                    }
                });
            } else {
                // If no translations exist in the target language, initialize it with current translations
                language.translations = { ...editable.value.translations };
            }

            // Save the updated language translations
            db.upsert(language);
        });
    }
};

// Save the current JSON to the database
const save = async () => {
    editable.value.updatedTimeUtc = Date.now();
    await db.upsert(editable.value);

    useNotificationStore().addNotification({
        title: "Language updated",
        description: "Language updated successfully",
        state: "success",
    });
};

// Convert the Default Language numberic value to a boolean for the toggle
const isDefault = computed({
    get: () => editable.value.default == 1,
    set: (newValue) => {
        editable.value.default = newValue ? 1 : 0;
    },
});

watch(
    comparisonLanguage,
    () => {
        selectedLanguageContent.value = languages.value.find(
            (l) => l._id === comparisonLanguage.value,
        );
    },
    { immediate: true },
);
</script>

<template>
    <BasePage
        :title="editable?.name"
        :backLinkLocation="{ name: 'languages' }"
        :backLinkText="`Languages overview`"
        :backLinkParams="{
            docType: DocType.Language,
        }"
        class="mb-16"
    >
        <template #actions>
            <div class="flex gap-2">
                <LBadge v-if="isLocalChange" variant="warning">Offline changes</LBadge>
                <div class="flex gap-1">
                    <LBadge v-if="isDirty" variant="warning" class="mr-2">Unsaved changes</LBadge>
                    <LButton
                        type="button"
                        variant="secondary"
                        v-if="isDirty && !isNew"
                        @click="revertChanges"
                        >Revert</LButton
                    >
                    <LButton type="button" @click="save" data-test="save-button" variant="primary">
                        Save
                    </LButton>
                </div>
            </div>
        </template>
        <div class="space-y-2">
            <LCard class="rounded-lg bg-white shadow-lg">
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
                        Default
                    </FormLabel>
                    <LToggle
                        name="is-language-default-toggle"
                        v-model:modelValue="isDefault"
                        :disabled="!canEditOrCreate || original?.default == 1"
                    />
                </div>
            </LCard>

            <!--Strings translation -->
            <LCard>
                <table class="mt-5 min-w-full divide-y divide-zinc-200">
                    <thead class="bg-zinc-50">
                        <tr>
                            <!-- key -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                            >
                                Key
                            </th>

                            <!-- value -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Value
                            </th>

                            <!-- value -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-3"
                            >
                                Action
                            </th>

                            <!-- action -->
                            <th
                                class="group py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-zinc-900 sm:pl-6"
                            >
                                Compare
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-200 bg-white">
                        <tr>
                            <td
                                class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 font-mono text-sm font-medium text-zinc-700 sm:pl-6"
                            >
                                <LInput
                                    name="key"
                                    v-model="keyInput"
                                    placeholder="Enter key (e.g., 'menu.home')"
                                />
                            </td>
                            <td
                                class="w-2/3 flex-1 whitespace-nowrap py-2 pl-4 pr-3 font-mono text-sm font-medium text-zinc-700 sm:pl-3"
                            >
                                <LInput
                                    name="value"
                                    v-model="valueInput"
                                    placeholder="Enter value (e.g., 'Homepage')"
                                />
                            </td>

                            <td
                                class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                            >
                                <LButton
                                    variant="primary"
                                    name="add"
                                    @click="addProperty()"
                                    :disabled="disabled"
                                    class="h-10 items-end"
                                >
                                    + Add
                                </LButton>
                            </td>

                            <td
                                class="w-1/3 flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6"
                            >
                                <LSelect
                                    v-model="comparisonLanguage"
                                    :options="
                                        languageOptions.filter(
                                            (l) =>
                                                editable &&
                                                editable._id &&
                                                l.value !== editable._id,
                                        )
                                    "
                                    :required="true"
                                />
                            </td>
                        </tr>
                        <tr
                            v-for="(val, key) in sortedTranslations"
                            :key="key"
                            data-test="translation-row"
                        >
                            <td
                                class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 font-mono text-sm font-medium text-zinc-700 sm:pl-6"
                            >
                                <span
                                    v-if="editingKey !== key"
                                    name="key-span"
                                    @click="startEditing(key, val)"
                                    class="flex cursor-pointer gap-1 hover:text-blue-600"
                                >
                                    {{ key }}
                                </span>
                                <input
                                    v-else
                                    v-model="newKey"
                                    name="key"
                                    class="w-full flex-1 rounded border px-2 text-sm font-medium"
                                    type="text"
                                    placeholder="Edit key"
                                    data-test="edit-key-input"
                                />
                            </td>
                            <td
                                class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                            >
                                <span
                                    v-if="editingKey !== key"
                                    name="value-span"
                                    @click="startEditing(key, val)"
                                    class="cursor-pointer text-wrap hover:text-blue-600"
                                >
                                    {{ val }}
                                </span>
                                <input
                                    v-else
                                    v-model="editingValue"
                                    name="value"
                                    class="w-full flex-1 rounded border px-2 text-sm font-medium"
                                    type="text"
                                    placeholder="Edit value"
                                    data-test="edit-value-input"
                                />
                            </td>
                            <td
                                class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                            >
                                <LButton
                                    v-if="editingKey === key"
                                    variant="primary"
                                    size="sm"
                                    @click="saveEditedKeyValue"
                                    data-test="save-key-button"
                                >
                                    Save
                                </LButton>
                                <LButton
                                    v-else
                                    variant="secondary"
                                    size="sm"
                                    @click="deleteProperty(key)"
                                    data-test="delete-key-button"
                                >
                                    Delete
                                </LButton>
                            </td>

                            <td
                                class="w-2/3 flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6"
                            >
                                <span class="text-wrap">
                                    {{ selectedLanguageContent?.translations[key] }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </LCard>
        </div>
    </BasePage>
</template>
