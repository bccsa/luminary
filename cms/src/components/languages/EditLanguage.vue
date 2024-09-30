<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import { db, DocType, type LanguageDto, type Uuid } from "luminary-shared";
import { useRouter } from "vue-router";
import LInput from "../forms/LInput.vue";
import GroupSelector from "../groups/GroupSelector.vue";
import LButton from "../button/LButton.vue";
import { computed, ref } from "vue";
import _ from "lodash";
import { useNotificationStore } from "@/stores/notification";

// Router and current language
const router = useRouter();
const { id } = router.currentRoute.value.params;
const currentLanguage = ref<LanguageDto | undefined>(undefined);
const currentLanguagePrev = ref<LanguageDto | undefined>(undefined);

// Fetch current language from the database
db.get<LanguageDto>(id as Uuid).then((lang) => {
    currentLanguage.value = lang;
    currentLanguagePrev.value = _.cloneDeep(lang);
});

// Track changes (dirty checking)
const isDirty = computed(() => !_.isEqual(currentLanguage.value, currentLanguagePrev.value));

// Save logic
const save = async () => {
    if (!currentLanguage.value) return;

    await db.upsert(currentLanguage.value);

    // Update the previous version after save
    currentLanguagePrev.value = _.cloneDeep(currentLanguage.value);

    // Optionally, show a notification here (e.g., "Language saved successfully")
    useNotificationStore().addNotification({
        title: `${currentLanguage.value.name} saved`,
        description: `The changes has been saved successfully`,
        state: "success",
    });
};
</script>

<template>
    <BasePage v-if="currentLanguage" :title="`${currentLanguage.name}`">
        <template #actions>
            <LButton type="button" variant="primary" @click="save" :disabled="!isDirty">
                Save
            </LButton>
        </template>
        <div class="b-4">
            <LInput
                label="Name"
                size="sm"
                name="languageName"
                class="w-full"
                v-model="currentLanguage.name"
            />
            <LInput
                label="Code"
                size="sm"
                name="languageCode"
                class="mt-6 w-full"
                v-model="currentLanguage.languageCode"
            />

            <GroupSelector
                v-model:groups="currentLanguage.memberOf"
                :docType="DocType.Language"
                class="mt-6"
            />
        </div>
    </BasePage>
</template>
