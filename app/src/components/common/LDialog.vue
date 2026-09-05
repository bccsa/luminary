<script setup lang="ts">
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import LModal from "../form/LModal.vue";

type Props = {
    title: string;
    description?: string;
    primaryAction: Function;
    secondaryAction?: Function;
    primaryButtonText: string;
    secondaryButtonText?: string;
    context?: "default" | "danger";
};

const open = defineModel<boolean>("open");

withDefaults(defineProps<Props>(), {
    context: "default",
});
</script>

<template>
    <LModal
        v-model:isVisible="open"
        :heading="title"
        @close="open = false"
    >
        <template #default>
            <div class="flex items-start gap-3 sm:gap-4">
                <div
                    class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100"
                    v-if="context === 'danger'"
                >
                    <ExclamationTriangleIcon
                        class="h-6 w-6 text-red-600"
                        aria-hidden="true"
                    />
                </div>
                <div class="min-w-0 flex-1 text-left">
                    <p
                        class="text-sm"
                        v-if="description"
                    >
                        {{ description }}
                    </p>
                    <slot />
                </div>
            </div>
        </template>

        <template #footer>
            <div class="mt-5 flex flex-col gap-2 sm:mt-4 sm:flex-row-reverse sm:gap-3">
                <LButton
                    @click="primaryAction()"
                    variant="primary"
                    class="w-full sm:w-auto"
                    :context="context"
                    data-test="modal-primary-button"
                >
                    {{ primaryButtonText }}
                </LButton>
                <LButton
                    @click="secondaryAction()"
                    class="w-full sm:w-auto"
                    v-if="secondaryAction && secondaryButtonText"
                    data-test="modal-secondary-button"
                >
                    {{ secondaryButtonText }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
