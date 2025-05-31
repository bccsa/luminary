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
import * as _ from "lodash";
import ConfirmBeforeLeavingModal from "../modals/ConfirmBeforeLeavingModal.vue";
import {
    PlusCircleIcon,
    FolderArrowDownIcon,
    ArrowUturnLeftIcon,
    TrashIcon,
} from "@heroicons/vue/24/solid";
import LDialog from "../common/LDialog.vue";
import router from "@/router";
import { capitaliseFirstLetter } from "@/util/string";

type translationKeyValuePair = {
    rowKey: Uuid;
    translationKey: string;
    translationValue: string;
    comparisonValue?: string;
};

type Props = {
    id: Uuid;
};
const props = defineProps<Props>();

const { addNotification } = useNotificationStore();

const translations = ref<translationKeyValuePair[]>([]);
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const isLocalChange = db.isLocalChangeAsRef(props.id);
const showDeleteModal = ref(false);

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

    if (!editable.value.translations) editable.value.translations = {};

    // Transform the translations into an array of translationKeyValuePair objects
    translations.value = Object.entries(editable.value.translations)
        .map(([key, value]) => ({
            rowKey: db.uuid(),
            translationKey: key,
            translationValue: value,
        }))
        .sort((a, b) => (a.translationKey > b.translationKey ? 1 : -1));

    originalLoadedHandler();
});

// Update editable when the translations list changes
watch(
    translations,
    () => {
        editable.value.translations = {};
        translations.value.forEach(({ translationKey, translationValue }) => {
            editable.value.translations[translationKey] = translationValue;
        });
    },
    { deep: true },
);

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

const keyInput = ref(""); // Holds the key being edited or added
const valueInput = ref(""); // Holds the value for the key being edited or added
const showStringDeleteModal = ref(false); // Modal to confirm deletion of a translation string key:value pair
const keyToDelete = ref<string | null>(null); // Add a ref to store the key to delete

const comparisonLanguage = ref<Uuid>(editable.value ? editable.value._id : "");

const languageOptions = computed(() =>
    languages.value.map((l) => ({ value: l._id, label: l.name })),
);

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

// Add a new translation key-value pair
const addProperty = () => {
    if (translations.value.find((row) => row.translationKey === keyInput.value)) {
        addNotification({
            title: "Key already exists",
            description: `The key '${keyInput.value}' already exists in the translations`,
            state: "error",
            timer: 5000,
        });
        return;
    }

    if (!keyInput.value || !valueInput.value) {
        addNotification({
            title: "Key or value missing",
            description: "Please enter both a key and a value to add a new translation",
            state: "error",
            timer: 5000,
        });
        return;
    }

    translations.value = [
        {
            rowKey: db.uuid(),
            translationKey: keyInput.value,
            translationValue: valueInput.value,
        },
        ...translations.value,
    ];

    keyInput.value = "";
    valueInput.value = "";
};

// Function to confirm deletion of a translation key
const confirmDelete = () => {
    if (keyToDelete.value) {
        translations.value = translations.value.filter(
            (row) => row.translationKey !== keyToDelete.value,
        );
        keyToDelete.value = null; // Reset after deletion
        showStringDeleteModal.value = false; // Close the modal
    }
};

// Save the current JSON to the database
const save = async () => {
    // Bypass save if the language is new and marked for deletion
    if (isNew.value && editable.value.deleteReq) {
        return;
    }

    // Update the original object to reflect the newly saved state
    original.value = _.cloneDeep(editable.value);

    editable.value.updatedTimeUtc = Date.now();
    await db.upsert({ doc: editable.value });

    if (!editable.value.deleteReq) {
        addNotification({
            title: "Language saved",
            description: "Language saved successfully",
            state: "success",
        });
    }
};

// Revert to the initial state
const revertChanges = () => {
    if (!original.value) return;
    editable.value = _.cloneDeep(original.value);

    // Transform the translations into an array of translationKeyValuePair objects
    translations.value = Object.entries(editable.value.translations)
        .map(([key, value]) => ({
            rowKey: db.uuid(),
            translationKey: key,
            translationValue: value,
        }))
        .sort((a, b) => (a.translationKey > b.translationKey ? 1 : -1));

    addNotification({
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

// Watch for changes in the comparison language and populate the compare column
watch(comparisonLanguage, () => {
    const comparisonLanguageDoc = languages.value.find((l) => l._id === comparisonLanguage.value);
    if (!comparisonLanguageDoc) return;

    // Populate the comparison language column for existing keys
    translations.value.forEach((row) => {
        row.comparisonValue = comparisonLanguageDoc.translations[row.translationKey] || "";
    });

    // Add missing keys from the comparison language
    Object.keys(comparisonLanguageDoc.translations).forEach((key) => {
        if (!translations.value.find((row) => row.translationKey === key)) {
            translations.value.push({
                rowKey: db.uuid(),
                translationKey: key,
                translationValue: "",
                comparisonValue: comparisonLanguageDoc.translations[key],
            });
        }
    });

    // Sort the translations by key
    translations.value = translations.value.sort((a, b) =>
        a.translationKey > b.translationKey ? 1 : -1,
    );
});

// Computed property to check if at least one group is selected
const hasGroupsSelected = ref(false);
watch(
    editable,
    () => {
        hasGroupsSelected.value = editable.value.memberOf.length > 0;
    },
    { deep: true, immediate: true },
);

// Language deletion
const canDelete = computed(() => {
    if (!editable.value) return false;
    return verifyAccess(editable.value.memberOf, DocType.Language, AclPermission.Delete, "all");
});

const deleteLanguage = async () => {
    if (!editable.value) return;

    if (!canDelete.value) {
        addNotification({
            title: "Insufficient Permissions",
            description: "You do not have delete permission",
            state: "error",
        });
        return;
    }

    editable.value.deleteReq = 1;

    save();

    addNotification({
        title: `${capitaliseFirstLetter(editable.value.name)} deleted`,
        description: `The language was successfully deleted`,
        state: "success",
    });

    router.push({
        name: "languages",
    });
};
</script>

<template>
    <BasePage
        :title="editable?.name"
        :backLinkLocation="{ name: 'languages' }"
        :backLinkText="`Languages overview`"
        :backLinkParams="{
            docType: DocType.Language,
        }"
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
                        :icon="ArrowUturnLeftIcon"
                        >Revert</LButton
                    >
                    <LButton
                        type="button"
                        @click="save"
                        data-test="save-button"
                        variant="primary"
                        :disabled="!isDirty || !hasGroupsSelected"
                        :icon="FolderArrowDownIcon"
                    >
                        Save
                    </LButton>
                    <LButton
                        type="button"
                        @click="showDeleteModal = true"
                        data-test="delete-button"
                        variant="secondary"
                        context="danger"
                        :icon="TrashIcon"
                        :disabled="!canDelete"
                    >
                        Delete
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

            <div class="min-h-screen">
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
                                    class="group py-3.5 pl-4 pr-3 text-center text-sm font-semibold text-zinc-900 sm:pl-3"
                                    v-if="canEditOrCreate"
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
                                    class="w-1/3 whitespace-nowrap py-2 pl-4 pr-3 font-mono text-sm font-medium text-zinc-700 sm:pl-6"
                                >
                                    <LInput
                                        name="key"
                                        v-model="keyInput"
                                        placeholder="Enter key (e.g., 'menu.home')"
                                        class="w-full"
                                        data-test="key-input"
                                    />
                                </td>
                                <td
                                    class="w-1/3 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                                >
                                    <LInput
                                        name="value"
                                        v-model="valueInput"
                                        placeholder="Enter value (e.g., 'Home Page')"
                                        class="w-full"
                                        data-test="value-input"
                                    />
                                </td>

                                <td
                                    class="w-1/8 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                                    v-if="canEditOrCreate"
                                >
                                    <div class="flex justify-center">
                                        <button
                                            @click="addProperty"
                                            data-test="add-key-button"
                                            class="mx-auto"
                                        >
                                            <PlusCircleIcon
                                                class="w-7 cursor-pointer text-zinc-500 hover:text-zinc-700"
                                            />
                                        </button>
                                    </div>
                                </td>

                                <td
                                    class="w-1/12 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6"
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
                                v-for="(row, index) in translations"
                                :key="row.rowKey"
                                data-test="translation-row"
                                :class="{
                                    'mb-96': index === translations.length - 1,
                                }"
                            >
                                <td
                                    class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 font-mono text-sm font-medium text-zinc-700 sm:pl-6"
                                >
                                    <LInput
                                        v-model="row.translationKey"
                                        name="key"
                                        type="text"
                                        inputType="textarea"
                                        placeholder="Edit key"
                                        data-test="edit-key-input"
                                        :disabled="!canEditOrCreate"
                                    />
                                </td>
                                <td
                                    class="flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 hover:cursor-pointer sm:pl-3"
                                >
                                    <LInput
                                        v-model="row.translationValue"
                                        name="value"
                                        type="text"
                                        inputType="textarea"
                                        placeholder="Edit value"
                                        data-test="edit-value-input"
                                        :state="row.translationValue ? 'default' : 'warning'"
                                        :disabled="!canTranslate"
                                    />
                                </td>
                                <td
                                    class="flex-1 justify-items-center whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
                                    v-if="canEditOrCreate"
                                >
                                    <TrashIcon
                                        class="h-6 w-6 cursor-pointer text-zinc-500 hover:text-red-600"
                                        title="Delete this line"
                                        @click="
                                            keyToDelete = row.translationKey;
                                            showStringDeleteModal = true;
                                        "
                                        data-test="delete-key-button"
                                    />
                                </td>

                                <td
                                    class="w-2/3 flex-1 whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-6"
                                >
                                    <span class="text-wrap">
                                        {{ row.comparisonValue }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </LCard>
            </div>
        </div>
    </BasePage>
    <ConfirmBeforeLeavingModal :isDirty="isDirty && !editable.deleteReq" />

    <LDialog
        v-model:open="showStringDeleteModal"
        context="default"
        title="Are you sure you want to delete this translation?"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        :primaryAction="confirmDelete"
        :secondaryAction="() => (showStringDeleteModal = false)"
    />

    <LDialog
        v-model:open="showDeleteModal"
        :title="`Delete ${editable.name}?`"
        :description="`Are you sure you want to delete this language? All content in this language will become unavailable! This action cannot be undone.`"
        :primaryAction="
            () => {
                showDeleteModal = false;
                console.log('Delete language');
                deleteLanguage();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
    ></LDialog>
</template>
