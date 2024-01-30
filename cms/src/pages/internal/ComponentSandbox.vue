<script setup lang="ts">
import { ref } from "vue";
import BasePage from "@/components/BasePage.vue";
import AcButton from "@/components/button/AcButton.vue";
import AcInput from "@/components/forms/AcInput.vue";
import AcTextarea from "@/components/forms/AcTextarea.vue";
import AcSelect from "@/components/forms/AcSelect.vue";
import { EnvelopeIcon } from "@heroicons/vue/20/solid";
import AcCard from "@/components/common/AcCard.vue";
import AcBadge from "@/components/common/AcBadge.vue";
import AcTable from "@/components/common/AcTable.vue";

// Input
const input = ref("Test value");

// Select
const languageOptions = [
    { label: "English", value: "en" },
    { label: "Swahili", value: "sw" },
    { label: "Chichewa", value: "ny" },
    { label: "Español", value: "es", disabled: true },
];
const selectedLanguage = ref("sw");

// Table
const sortBy = ref(undefined);
const sortDirection = ref(undefined);
const columns = [
    {
        text: "Title",
        key: "title",
    },
    {
        text: "Translations",
        key: "translations",
        sortable: false,
    },
    {
        text: "",
        key: "actions",
        sortable: false,
    },
];

const items = [
    {
        id: 1,
        title: "Life is the light of men",
        translations: {
            en: "success",
            fr: "success",
            sw: "info",
            ny: "default",
        },
    },
    {
        id: 2,
        title: "A story about my cat",
        translations: {
            en: "success",
            fr: "default",
            sw: "success",
            ny: "info",
        },
    },
    {
        id: 3,
        title: "Alons enfants de la patrie",
        translations: {
            en: "default",
            fr: "success",
            sw: "default",
            ny: "default",
        },
    },
    {
        id: 4,
        title: "Forth Éorlingas, or what I learned watching Lord of the Rings",
        translations: {
            en: "success",
            fr: "success",
            sw: "info",
            ny: "success",
        },
    },
];
</script>

<template>
    <BasePage title="Component sandbox">
        <div class="space-y-6">
            <AcCard title="Form elements">
                <div class="flex flex-col gap-4">
                    <AcInput
                        label="Normal input"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                        :icon="EnvelopeIcon"
                    />
                    <AcInput
                        label="Normal input"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                    />
                    <AcInput
                        label="With addons"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                        leftAddOn="$"
                        rightAddOn="USD"
                    />
                    <AcInput
                        label="Disabled input"
                        placeholder="Placeholder"
                        v-model="input"
                        disabled
                        class="w-1/2"
                        :icon="EnvelopeIcon"
                    >
                        With a bottom text
                    </AcInput>
                    <AcInput
                        label="Error input"
                        placeholder="Placeholder"
                        v-model="input"
                        class="w-1/2"
                        state="error"
                        :icon="EnvelopeIcon"
                    >
                        This input is invalid
                    </AcInput>
                    <AcInput
                        label="With addons"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                        leftAddOn="$"
                        rightAddOn="USD"
                        state="error"
                    >
                        This input is invalid
                    </AcInput>

                    <AcTextarea label="Textarea" v-model="input" class="w-1/2" />

                    <AcSelect
                        :options="languageOptions"
                        v-model="selectedLanguage"
                        label="Select a language"
                        class="mt-6 w-1/2"
                    >
                        The language for this page
                    </AcSelect>

                    <AcSelect
                        state="error"
                        :options="languageOptions"
                        v-model="selectedLanguage"
                        label="Error select"
                        class="w-1/2"
                    >
                        This input is invalid
                    </AcSelect>

                    <AcSelect
                        disabled
                        :options="languageOptions"
                        v-model="selectedLanguage"
                        label="Disabled select"
                        class="w-1/2"
                    />
                </div>
            </AcCard>

            <AcCard class="text-sm">
                Card without title

                <template #footer>With footer</template>
            </AcCard>

            <AcCard padding="none" title="Table">
                <AcTable
                    :columns="columns"
                    :items="items"
                    v-model:sortBy="sortBy"
                    v-model:sortDirection="sortDirection"
                >
                    <template #item.translations="{ translations }">
                        <span class="space-x-2">
                            <AcBadge
                                v-for="(status, key) in translations"
                                :key="key"
                                type="language"
                                :variant="status"
                            >
                                {{ key }}
                            </AcBadge>
                        </span>
                    </template>
                    <template #item.actions>
                        <AcButton variant="secondary" size="sm">Edit</AcButton>
                    </template>
                </AcTable>
            </AcCard>

            <AcCard title="Badges">
                <div class="flex gap-2">
                    <AcBadge>Default</AcBadge>
                    <AcBadge variant="success">Success</AcBadge>
                    <AcBadge variant="warning">Warning</AcBadge>
                    <AcBadge variant="error">Error</AcBadge>
                    <AcBadge variant="info">Info</AcBadge>
                </div>
                <div class="mt-4 flex gap-2">
                    <AcBadge type="language">en</AcBadge>
                    <AcBadge type="language" variant="success">fr</AcBadge>
                    <AcBadge type="language" variant="warning">sw</AcBadge>
                    <AcBadge type="language" variant="error">ny</AcBadge>
                    <AcBadge type="language" variant="info">es</AcBadge>
                </div>
            </AcCard>

            <AcCard title="Buttons">
                <div class="space-x-4">
                    <AcButton>Save as draft</AcButton>
                    <AcButton variant="primary">Publish</AcButton>
                    <AcButton disabled>Save as draft</AcButton>
                    <AcButton disabled variant="primary">Publish</AcButton>
                </div>
            </AcCard>
        </div>
    </BasePage>
</template>
