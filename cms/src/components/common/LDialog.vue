<script setup lang="ts">
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
        <p class="text-sm text-gray-500">{{ description }}</p>
        <slot name="default" />

        <template #footer>
            <div class="flex justify-between items-center">
                <div>
                    <slot name="footer-extra" />
                </div>
            <div class="flex gap-2">
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
            </div>
            </div>
        </template>
    </LModal>
</template>
