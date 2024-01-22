<script setup lang="ts">
import { ref } from "vue";
import BasePage from "@/components/BasePage.vue";
import AcButton from "@/components/button/AcButton.vue";
import AcInput from "@/components/forms/AcInput.vue";
import { EnvelopeIcon } from "@heroicons/vue/20/solid";
import AcCard from "@/components/AcCard.vue";

const input = ref("Test value");
</script>

<template>
    <BasePage title="Component sandbox">
        <div class="space-y-6">
            <AcCard title="Input elements">
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
                </div>
            </AcCard>

            <AcCard>Card without title</AcCard>

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
