<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LTextToggle from "@/components/forms/LTextToggle.vue";
import { PublishStatus, type ContentDto, db } from "luminary-shared";
import { computed, ref } from "vue";
import { DateTime } from "luxon";
import { BackspaceIcon } from "@heroicons/vue/20/solid";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

const publishDateString = computed({
    get() {
        if (!content.value || !content.value.publishDate) return;
        return db.toIsoDateTime(content.value.publishDate) || undefined;
    },
    set(val) {
        if (!content.value) return;
        if (!val) {
            content.value.publishDate = undefined;
            return;
        }
        content.value.publishDate = db.fromIsoDateTime(val);
    },
});

const expiryDateString = computed({
    get() {
        if (!content.value || !content.value.expiryDate) return;
        return db.toIsoDateTime(content.value.expiryDate) || undefined;
    },
    set(val) {
        if (!content.value) return;
        if (!val) {
            content.value.expiryDate = undefined;
            return;
        }
        content.value.expiryDate = db.fromIsoDateTime(val);
    },
});

const selectedExpiryNumber = ref<number | undefined>(undefined);
const selectedExpiryUnit = ref<string | undefined>(undefined);

const calculateExpiryDate = () => {
    if (
        !content.value ||
        !content.value.publishDate ||
        !selectedExpiryNumber.value ||
        !selectedExpiryUnit.value
    )
        return;

    switch (selectedExpiryUnit.value) {
        case "Week":
            content.value.expiryDate = DateTime.fromMillis(content.value.publishDate)
                .plus({ weeks: selectedExpiryNumber.value })
                .toMillis();
            break;
        case "Month":
            content.value.expiryDate = DateTime.fromMillis(content.value.publishDate)
                .plus({ months: selectedExpiryNumber.value })
                .toMillis();
            break;
        case "Year":
            content.value.expiryDate = DateTime.fromMillis(content.value.publishDate)
                .plus({ years: selectedExpiryNumber.value })
                .toMillis();
            break;
        default:
            console.warn(`Unknown unit: ${selectedExpiryUnit.value}`);
    }
    clearExpirySelection();
};

const setExpiryNumber = (number: number | undefined) => {
    selectedExpiryNumber.value = number;
    calculateExpiryDate();
};

const setExpiryUnit = (unit: string | undefined) => {
    selectedExpiryUnit.value = unit;
    calculateExpiryDate();
};

const clearExpirySelection = () => {
    selectedExpiryNumber.value = undefined;
    selectedExpiryUnit.value = undefined;
};

const clearExpiryDate = () => {
    if (content.value) content.value.expiryDate = undefined;
    clearExpirySelection();
};
</script>

<template>
    <LCard v-if="content" title="Status" collapsible>
        <div class="flex flex-col items-center gap-2">
            <LTextToggle
                v-model="content.status"
                left-label="Draft"
                :left-value="PublishStatus.Draft"
                right-label="Publishable"
                :right-value="PublishStatus.Published"
                :disabled="disabled"
            />
            <div class="text-xs text-zinc-700">
                {{
                    content.status == PublishStatus.Draft
                        ? "This content will never be visible in the app"
                        : "This content could be visible in the app, depending on the publish and expiry dates"
                }}
            </div>
        </div>

        <div class="mt-6 flex flex-col gap-4 sm:flex-row">
            <!-- Publish date -->
            <LInput
                v-model="publishDateString"
                name="publishDate"
                label="Publish date"
                class="sm:w-1/2"
                type="datetime-local"
                :disabled="disabled"
            />

            <!-- Expiry date -->
            <LInput
                v-model="expiryDateString"
                name="expiryDate"
                label="Expiry date"
                class="group sm:w-1/2"
                type="datetime-local"
                :disabled="disabled"
            >
                <!-- Expiry date shortcut buttons -->
                <div class="flex w-full cursor-pointer flex-wrap gap-1">
                    <LButton
                        type="button"
                        name="1"
                        variant="secondary"
                        class="flex-1"
                        :class="{
                            '!bg-black !text-white': selectedExpiryNumber === 1,
                        }"
                        :disabled="disabled"
                        @click="setExpiryNumber(1)"
                    >
                        1
                    </LButton>
                    <LButton
                        type="button"
                        name="2"
                        variant="secondary"
                        class="flex-1"
                        :class="{ '!bg-black !text-white': selectedExpiryNumber === 2 }"
                        :disabled="disabled"
                        @click="setExpiryNumber(2)"
                    >
                        2
                    </LButton>
                    <LButton
                        type="button"
                        name="3"
                        variant="secondary"
                        class="flex-1"
                        :class="{ '!bg-black !text-white': selectedExpiryNumber === 3 }"
                        :disabled="disabled"
                        @click="setExpiryNumber(3)"
                    >
                        3
                    </LButton>
                    <LButton
                        type="button"
                        name="6"
                        variant="secondary"
                        class="flex-1"
                        :class="{ '!bg-black !text-white': selectedExpiryNumber === 6 }"
                        :disabled="disabled"
                        @click="setExpiryNumber(6)"
                    >
                        6
                    </LButton>
                    <LButton
                        type="button"
                        name="W"
                        variant="secondary"
                        class="flex-1"
                        :class="{ '!bg-black !text-white': selectedExpiryUnit === 'Week' }"
                        data-test="W"
                        :disabled="disabled"
                        @click="setExpiryUnit('Week')"
                    >
                        W
                    </LButton>
                    <LButton
                        type="button"
                        name="M"
                        variant="secondary"
                        class="flex-1"
                        :class="{ '!bg-black !text-white': selectedExpiryUnit === 'Month' }"
                        :disabled="disabled"
                        @click="setExpiryUnit('Month')"
                    >
                        M
                    </LButton>
                    <LButton
                        type="button"
                        name="Y"
                        variant="secondary"
                        class="flex-1"
                        :class="{ '!bg-black !text-white': selectedExpiryUnit === 'Year' }"
                        :disabled="disabled"
                        @click="setExpiryUnit('Year')"
                    >
                        Y
                    </LButton>
                    <LButton
                        type="button"
                        name="clear"
                        variant="secondary"
                        :icon="BackspaceIcon"
                        class="flex-1"
                        :disabled="disabled"
                        @click="clearExpiryDate()"
                    >
                    </LButton>
                </div>
            </LInput>
        </div>
    </LCard>
</template>
