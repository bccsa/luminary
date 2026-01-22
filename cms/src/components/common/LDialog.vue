<script setup lang="ts">
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import LModal from "../modals/LModal.vue";

type Props = {
    title: string;
    description?: string;
    primaryAction: Function;
    secondaryAction?: Function;
    primaryButtonText: string;
    secondaryButtonText?: string;
    primaryDisableCondition?: boolean;
    context?: "default" | "danger";
    noDivider?: boolean;
};

const open = defineModel<boolean>("open");

withDefaults(defineProps<Props>(), {
    context: "default",
    noDivider: false,
});
</script>

<template>
    <LModal v-model:isVisible="open" :heading="title" :noDivider="noDivider">
        <template #header>
            <div class="flex items-center">
                <div
                    v-if="context === 'danger'"
                    class="mr-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-100"
                >
                    <ExclamationTriangleIcon class="h-5 w-5 text-red-600" aria-hidden="true" />
                </div>
                <h3 class="text-lg font-medium leading-6 text-gray-900">{{ title }}</h3>
            </div>
        </template>

        <p class="text-sm text-gray-500">{{ description }}</p>
        <slot name="default" />

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton
                    @click="primaryAction()"
                    variant="primary"
                    :context="context"
                    data-test="modal-primary-button"
                    :disabled="primaryDisableCondition"
                >
                    {{ primaryButtonText }}
                </LButton>
                <LButton
                    @click="secondaryAction()"
                    variant="secondary"
                    data-test="modal-secondary-button"
                    v-if="secondaryAction && secondaryButtonText"
                >
                    {{ secondaryButtonText }}
                </LButton>
                <slot name="footer-extra" />
            </div>
        </template>
    </LModal>
</template>
