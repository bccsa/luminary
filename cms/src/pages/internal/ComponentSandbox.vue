<script setup lang="ts">
import { ref } from "vue";
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTextarea from "@/components/forms/LTextarea.vue";
import LSelect from "@/components/forms/LSelect.vue";
import {
    DocumentDuplicateIcon,
    EnvelopeIcon,
    PencilSquareIcon,
    PlusIcon,
} from "@heroicons/vue/20/solid";
import LCard from "@/components/common/LCard.vue";
import LBadge from "@/components/common/LBadge.vue";
import LTable from "@/components/common/LTable.vue";
import LTabs from "@/components/common/LTabs.vue";

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

const tabs = [
    {
        title: "English",
        key: "eng",
    },
    {
        title: "Swahili",
        key: "swa",
    },
];
const selectedTab = ref("eng");

// Table
const sortBy = ref(undefined);
const sortDirection = ref(undefined);
const currentPage = ref(1);
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
            eng: "success",
            fra: "success",
            swa: "info",
            nya: "default",
        },
    },
    {
        id: 2,
        title: "A story about my cat",
        translations: {
            eng: "success",
            fra: "default",
            swa: "success",
            nya: "info",
        },
    },
    {
        id: 3,
        title: "Alons enfants de la patrie",
        translations: {
            eng: "default",
            fra: "success",
            swa: "default",
            nya: "default",
        },
    },
    {
        id: 4,
        title: "Forth Éorlingas, or what I learned watching Lord of the Rings",
        translations: {
            eng: "success",
            fra: "success",
            swa: "info",
            nya: "success",
        },
    },
    {
        id: 5,
        title: "An unexpected journey",
        translations: {
            eng: "success",
            fra: "info",
            swa: "info",
            nya: "default",
        },
    },
];
</script>

<template>
    <BasePage title="Component sandbox">
        <div class="space-y-6">
            <LCard title="Form elements" collapsible>
                <div class="flex flex-col gap-4">
                    <LInput
                        name="input"
                        label="Normal input"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                        :icon="EnvelopeIcon"
                    />
                    <LInput
                        name="input"
                        label="Normal input"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                    />
                    <LInput
                        name="input"
                        label="With addons"
                        placeholder="Placeholder"
                        v-model="input"
                        required
                        class="w-1/2"
                        leftAddOn="$"
                        rightAddOn="USD"
                    />
                    <LInput
                        name="input"
                        label="Disabled input"
                        placeholder="Placeholder"
                        v-model="input"
                        disabled
                        class="w-1/2"
                        :icon="EnvelopeIcon"
                    >
                        With a bottom text
                    </LInput>
                    <LInput
                        name="input"
                        label="Error input"
                        placeholder="Placeholder"
                        v-model="input"
                        class="w-1/2"
                        state="error"
                        :icon="EnvelopeIcon"
                    >
                        This input is invalid
                    </LInput>
                    <LInput
                        name="input"
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
                    </LInput>

                    <LTextarea label="Textarea" v-model="input" class="w-1/2" />

                    <LSelect
                        :options="languageOptions"
                        v-model="selectedLanguage"
                        label="Select a language"
                        class="mt-6 w-1/2"
                    >
                        The language for this page
                    </LSelect>

                    <LSelect
                        state="error"
                        :options="languageOptions"
                        v-model="selectedLanguage"
                        label="Error select"
                        class="w-1/2"
                    >
                        This input is invalid
                    </LSelect>

                    <LSelect
                        disabled
                        :options="languageOptions"
                        v-model="selectedLanguage"
                        label="Disabled select"
                        class="w-1/2"
                    />
                </div>
            </LCard>

            <LCard class="text-sm">
                Card without title

                <template #footer>With footer</template>
            </LCard>

            <LCard padding="none">
                <LTable
                    :columns="columns"
                    :items="items"
                    paginate
                    v-model:currentPage="currentPage"
                    :itemsPerPage="2"
                    v-model:sortBy="sortBy"
                    v-model:sortDirection="sortDirection"
                >
                    <template #item.translations="{ translations }">
                        <span class="flex gap-2">
                            <LBadge
                                v-for="(status, key) in translations"
                                :key="key"
                                type="language"
                                :variant="status"
                            >
                                {{ key }}
                            </LBadge>
                        </span>
                    </template>
                    <template #item.actions>
                        <LButton variant="tertiary" size="sm" :icon="PencilSquareIcon"></LButton>
                    </template>
                </LTable>
            </LCard>

            <LCard title="Tabs">
                <LTabs :tabs="tabs" v-model:currentTab="selectedTab">
                    <LButton variant="tertiary" :icon="PlusIcon">Add translation</LButton>
                </LTabs>
            </LCard>

            <LCard title="Badges">
                <div class="flex gap-2">
                    <LBadge>Default</LBadge>
                    <LBadge variant="success">Success</LBadge>
                    <LBadge variant="warning">Warning</LBadge>
                    <LBadge variant="error">Error</LBadge>
                    <LBadge variant="info">Info</LBadge>
                    <LBadge variant="scheduled">Scheduled</LBadge>
                </div>
                <div class="mt-4 flex gap-2">
                    <LBadge type="language" withIcon>eng</LBadge>
                    <LBadge type="language" withIcon variant="success">fra</LBadge>
                    <LBadge type="language" withIcon variant="warning">swa</LBadge>
                    <LBadge type="language" withIcon variant="error">nya</LBadge>
                    <LBadge type="language" withIcon variant="info">spa</LBadge>
                    <LBadge type="language" withIcon variant="scheduled">zul</LBadge>
                </div>
            </LCard>

            <LCard title="Buttons">
                <div class="space-x-4">
                    <LButton>Save as draft</LButton>
                    <LButton variant="primary">Publish</LButton>
                    <LButton variant="tertiary">Edit post</LButton>
                    <LButton disabled>Save as draft</LButton>
                    <LButton disabled variant="primary">Publish</LButton>
                    <LButton disabled variant="tertiary">Edit post</LButton>
                </div>
                <div class="mt-6 space-x-4">
                    <LButton context="danger">Delete</LButton>
                    <LButton variant="primary" context="danger">Discard</LButton>
                    <LButton variant="tertiary" context="danger">Delete</LButton>
                    <LButton disabled context="danger">Delete</LButton>
                    <LButton disabled variant="primary" context="danger">Delete</LButton>
                    <LButton disabled variant="tertiary" context="danger">Delete</LButton>
                </div>
                <div class="mt-6 space-x-4">
                    <LButton :icon="PencilSquareIcon">Edit</LButton>
                    <LButton variant="primary" :icon="PencilSquareIcon">Edit</LButton>
                    <LButton variant="tertiary" :icon="PencilSquareIcon">Edit</LButton>
                    <LButton variant="tertiary" :icon="PencilSquareIcon"></LButton>
                </div>
                <div class="mt-6 space-x-4">
                    <LButton size="sm">Save as draft</LButton>
                    <LButton size="base">Save as draft</LButton>
                    <LButton size="lg">Save as draft</LButton>
                    <LButton variant="muted" :icon="DocumentDuplicateIcon" size="sm"></LButton>
                    <LButton variant="muted" :icon="DocumentDuplicateIcon"></LButton>
                    <LButton variant="muted" :icon="DocumentDuplicateIcon" size="lg"></LButton>
                </div>
            </LCard>
        </div>
    </BasePage>
</template>
