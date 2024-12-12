<script setup lang="ts">
import {
    AclPermission,
    db,
    DocType,
    hasAnyPermission,
    verifyAccess,
    type LanguageDto,
    type Uuid,
} from "luminary-shared";
import { ref, computed, watch } from "vue";
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

type Props = {
    id: Uuid;
};
const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

const currentLanguage = computed({
    get(): LanguageDto {
        const foundLanguage = languages.value?.find((l) => l._id === props.id);
        return foundLanguage
            ? foundLanguage
            : {
                  _id: props.id,
                  name: "New language",
                  languageCode: "",
                  default: 0,
                  memberOf: [],
                  type: DocType.Language,
                  updatedTimeUtc: Date.now(),
                  translations: {},
              };
    },
    set(value) {
        if (currentLanguage.value) {
            currentLanguage.value = value;
        }
    },
});

const isLocalChange = db.isLocalChangeAsRef(props.id);

const keyInput = ref(""); // Holds the key being edited or added
const valueInput = ref(""); // Holds the value for the key being edited or added
const newKey = ref<string>(""); // Temporary variable for editing the key

const selectedLanguage = ref<Uuid>(currentLanguage.value ? currentLanguage.value._id : "");
const selectedLanguageContent = ref<LanguageDto>();

const languageOptions = computed(() =>
    languages.value.map((l) => ({ value: l._id, label: l.name })),
);

// Sort translations by key before rendering
const sortedTranslations = computed(() => {
    if (currentLanguage.value?.translations) {
        const sortedKeys = Object.keys(currentLanguage.value.translations).sort();
        return sortedKeys.reduce(
            (acc, key) => {
                acc[key] = currentLanguage.value.translations[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    }
    return {};
});

const canEditOrCreate = computed(() => {
    if (currentLanguage.value) {
        return verifyAccess(
            currentLanguage.value.memberOf,
            DocType.Language,
            AclPermission.Edit,
            "all",
        );
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
        currentLanguage.value.translations = {
            ...currentLanguage.value.translations, // Keep existing translations
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
        delete currentLanguage.value.translations[key];
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
const saveEditedKeyValue = () => {
    if (editingKey.value && newKey.value) {
        // Update the translations object with the new key and value
        currentLanguage.value.translations = {
            ...currentLanguage.value.translations,
            [newKey.value]: editingValue.value,
        };

        // Remove the old key if it was changed
        if (editingKey.value !== newKey.value) {
            delete currentLanguage.value.translations[editingKey.value];
        }
    }

    // Reset editing states
    editingKey.value = null;
    newKey.value = "";
    editingValue.value = "";
};

// Function to replace translations in other languages
const updateTranslationsInOtherLanguages = () => {
    if (currentLanguage.value?.translations) {
        languages.value.forEach((language) => {
            // Skip the current language
            if (language._id === currentLanguage.value._id) return;

            if (language.translations) {
                // Merge current language's translations into other languages' translations
                Object.keys(currentLanguage.value.translations).forEach((key) => {
                    // Only update the translation if it's not already set in the target language
                    if (!language.translations[key]) {
                        language.translations[key] = "";
                    }
                });
            } else {
                // If no translations exist in the target language, initialize it with current translations
                language.translations = { ...currentLanguage.value.translations };
            }

            // Save the updated language translations
            db.upsert(language);
        });
    }
};

// Save the current JSON to the database
const save = async () => {
    currentLanguage.value.updatedTimeUtc = Date.now();
    await db.upsert(currentLanguage.value);

    updateTranslationsInOtherLanguages();

    useNotificationStore().addNotification({
        title: "Language updated",
        description: "Language updated successfully",
        state: "success",
    });
};

// Convert the default value to a boolean for the toggle
const isDefault = ref(currentLanguage.value && currentLanguage.value.default == 1 ? true : false);
watch(isDefault, (newValue) => {
    currentLanguage.value.default = newValue ? 1 : 0;
});

watch(
    selectedLanguage,
    () => {
        selectedLanguageContent.value = languages.value.find(
            (l) => l._id === selectedLanguage.value,
        );
    },
    { immediate: true },
);
</script>

<template>
    <BasePage :title="currentLanguage?.name" class="mb-16">
        <template #actions>
            <div class="flex gap-2">
                <LBadge v-if="isLocalChange" variant="warning">Offline changes</LBadge>
                <div class="flex gap-1">
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
                    v-model="currentLanguage.name"
                    class="mb-4 w-full"
                    placeholder="Enter language name"
                    :disabled="!canEditOrCreate"
                />

                <LInput
                    label="Code"
                    name="languageCode"
                    v-model="currentLanguage.languageCode"
                    class="mb-4 w-full"
                    placeholder="Enter language code"
                    :disabled="!canEditOrCreate"
                />

                <GroupSelector
                    v-model:groups="currentLanguage.memberOf"
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
                        v-model:modelValue="isDefault"
                        :disabled="!canEditOrCreate"
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
                                    v-model="selectedLanguage"
                                    :options="
                                        languageOptions.filter(
                                            (l) =>
                                                currentLanguage &&
                                                currentLanguage._id &&
                                                l.value !== currentLanguage._id,
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
