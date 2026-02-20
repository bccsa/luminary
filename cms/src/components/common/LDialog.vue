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
    context?: "default" | "danger";
    primaryButtonDisabled?: boolean;
    largeModal?: boolean;
};

const open = defineModel<boolean>("open");

withDefaults(defineProps<Props>(), {
    context: "default",
});
</script>

<template>
    <LModal v-model:isVisible="open" :heading="title" :noDivider="true" :largeModal="largeModal">
        <p v-if="description" class="shrink-0 text-sm text-gray-500">{{ description }}</p>
        <div class="min-h-0 flex-1 overflow-y-scroll scrollbar-hide">
            <slot name="default" />
        </div>

        <template #footer>
            <div class="flex items-center justify-between">
                <div>
                    <slot name="footer-extra" />
                </div>
                <div class="flex gap-2">
                    <LButton
                        @click="primaryAction()"
                        variant="primary"
                        :context="context"
                        :disabled="primaryButtonDisabled"
                        data-test="modal-primary-button"
                        class="ml-2"
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
