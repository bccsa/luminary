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
import ConfirmBeforeLeavingModal from "../modals/ConfirmBeforeLeavingModal.vue";
import { TrashIcon } from "@heroicons/vue/20/solid";
import LModal from "../common/LModal.vue";

type Props = {
    id: Uuid;
};
const props = defineProps<Props>();

const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const isLocalChange = db.isLocalChangeAsRef(props.id);

const keyInput = ref(""); // Holds the key being edited or added
const valueInput = ref(""); // Holds the value for the key being edited or added
const newKey = ref<string>(""); // Temporary variable for editing the key
const isModalOpen = ref(false); // Modal to confirm deletion of a translation
const keyToDelete = ref<string | null>(null); // Add a ref to store the key to delete
const editingKey = ref<string | null>(null); // To track which key is being edited
const editingValue = ref<string>(""); // To hold the value of the key being edited

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
const isNew = computed(() => !original.value?._id);

watch(
    languages,
    () => {
        if (isNew.value) {
            editable.value.translations = (() => {
                const defaultLanguage = languages.value.find((lang) => lang.default === 1);
                if (defaultLanguage?.translations) return { ...defaultLanguage.translations };

                const englishLanguage = languages.value.find((lang) => lang.languageCode === "en");
                if (englishLanguage?.translations) return { ...englishLanguage.translations };

                return {};
            })();
        }
    },
    { deep: true, immediate: true },
);

// Clone the original language when it's loaded into the editable object
const originalLoadedHandler = watch(original, () => {
    if (!original.value) return;
    editable.value = _.cloneDeep(original.value);
    originalLoadedHandler();
});

// Check if the language is dirty (has unsaved changes)
const isDirty = ref(false);
watch(
    [editable, original, newKey, editingValue],
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

const canTranslate = computed(() => {
    if (!editable.value) return false;

    if (!verifyAccess(editable.value.memberOf, DocType.Language, AclPermission.Translate)) {
        return false;
    }
    return true;
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

// Function to confirm deletion of a translation key
const confirmDelete = () => {
    if (keyToDelete.value) {
        delete editable.value.translations[keyToDelete.value]; // Delete the key
        keyToDelete.value = null; // Reset after deletion
        isModalOpen.value = false; // Close the modal
    }
};

// Function to start editing a translation value
const startEditing = (key: string, value: string) => {
    editingKey.value = key;
    newKey.value = key;
    editingValue.value = value;
    // if (value) editingValue.value = value;
};

// Save the edited key and value in real-time
const saveInRealTime = (key: string, value: string) => {
    if (key && value) {
        editable.value.translations = {
            ...editable.value.translations,
            [key]: value,
        };
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

// Computed property to check if at least one group is selected
const hasGroupsSelected = computed(() => editable.value.memberOf?.length > 0);
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
                <LBadge v-if="!hasGroupsSelected" variant="error" class="mr-2"
                    >No groups selected</LBadge
                >
                <div class="flex gap-1">
                    <LBadge v-if="isDirty" variant="warning" class="mr-2">Unsaved changes</LBadge>
                    <LButton
                        type="button"
                        variant="secondary"
                        v-if="isDirty && !isNew"
                        @click="revertChanges"
                        >Revert</LButton
                    >
                    <LButton
                        type="button"
                        @click="save"
                        data-test="save-button"
                        variant="primary"
                        :disabled="!isDirty || !hasGroupsSelected"
                    >
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

                <!-- add a divider line -->
                <div class="my-3 border-t border-zinc-200"></div>

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
                                class="w-1/4 whitespace-nowrap py-2 pl-4 pr-3 font-mono text-sm font-medium text-zinc-700 sm:pl-6"
                            >
                                <LInput
                                    name="key"
                                    v-model="keyInput"
                                    placeholder="Enter key (e.g., 'menu.home')"
                                    class="w-full"
                                />
                            </td>
                            <td
                                class="pr-3text-sm w-1/3 whitespace-nowrap py-2 pl-4 font-medium text-zinc-700 sm:pl-3"
                            >
                                <LInput
                                    name="value"
                                    v-model="valueInput"
                                    placeholder="Enter value (e.g., 'Homepage')"
                                    class="w-full"
                                />
                            </td>

                            <td
                                class="w-1/6 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                            >
                                <LButton
                                    variant="primary"
                                    name="add"
                                    @click="addProperty()"
                                    :disabled="disabled"
                                    class="h-10 w-full"
                                >
                                    + Add
                                </LButton>
                            </td>

                            <td
                                class="w-1/4 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6"
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
                                    class="w-full"
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
                                @click="canTranslate ? startEditing(key, val) : null"
                            >
                                <span
                                    v-if="editingKey !== key"
                                    name="key-span"
                                    @click="canTranslate ? startEditing(key, val) : null"
                                    :class="
                                        canTranslate
                                            ? 'flex cursor-pointer gap-1 hover:text-blue-600'
                                            : ''
                                    "
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
                                class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 hover:cursor-pointer hover:text-blue-600 sm:pl-3"
                                @click="startEditing(key, val)"
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
                                    @input="saveInRealTime(key, editingValue)"
                                />
                            </td>
                            <td
                                class="flex-1 justify-items-center whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                            >
                                <TrashIcon
                                    class="h-6 w-6 cursor-pointer hover:text-red-600"
                                    title="Delete this line"
                                    @click="
                                        keyToDelete = key;
                                        isModalOpen = true;
                                    "
                                    data-test="delete-key-button"
                                />
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

    <ConfirmBeforeLeavingModal :isDirty="isDirty" />

    <LModal
        v-model:open="isModalOpen"
        context="danger"
        title="Are you sure you want to delete this translation?"
        description="This action cannot be undone. Please confirm if you want to proceed with deleting the translation."
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        :primaryAction="confirmDelete"
        :secondaryAction="() => (isModalOpen = false)"
    />
</template>
