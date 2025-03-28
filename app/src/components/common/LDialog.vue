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
    <LModal v-model:isVisible="open" :heading="title" @close="open = false">
        <template #default>
            <div class="sm:flex sm:items-start">
                <div
                    class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
                    v-if="context === 'danger'"
                >
                    <ExclamationTriangleIcon class="h-6 w-6 text-red-600" aria-hidden="true" />
                </div>
                <div
                    :class="[
                        'mt-3 text-center sm:mt-0 sm:text-left',
                        { 'sm:ml-4': context !== 'default' },
                    ]"
                >
                    <div class="mt-2" v-if="description">
                        <p class="text-sm">
                            {{ description }}
                        </p>
                    </div>
                </div>
            </div>
        </template>

        <template #footer>
            <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <span class="mb-3 block sm:mb-0 sm:ml-3">
                    <LButton
                        @click="primaryAction()"
                        variant="primary"
                        class="inline-flex w-full sm:w-auto"
                        :context="context"
                        data-test="modal-primary-button"
                    >
                        {{ primaryButtonText }}
                    </LButton>
                </span>
                <LButton
                    @click="secondaryAction()"
                    class="inline-flex w-full sm:w-auto"
                    v-if="secondaryAction && secondaryButtonText"
                >
                    {{ secondaryButtonText }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
