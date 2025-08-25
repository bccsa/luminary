<script setup lang="ts">
import { ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import LTeleport from "./LTeleport.vue";

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
    <LTeleport>
        <div v-if="open" @click="open = false">
            <div class="fixed inset-0 z-50 bg-zinc-500 bg-opacity-75 transition-opacity"></div>
            <div class="fixed inset-0 z-50 flex items-center justify-center rounded-lg p-2">
                <div
                    class="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg sm:p-6"
                    @click.stop
                >
                    <div class="sm:flex sm:items-start">
                        <div
                            class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
                            v-if="context == 'danger'"
                        >
                            <ExclamationTriangleIcon
                                class="h-6 w-6 text-red-600"
                                aria-hidden="true"
                            />
                        </div>
                        <div
                            :class="[
                                'mt-3 text-center sm:mt-0 sm:text-left',
                                { 'sm:ml-4': context != 'default' },
                            ]"
                        >
                            <h3 class="text-base font-semibold leading-6 text-zinc-900">
                                {{ title }}
                            </h3>

                            <div class="mt-2" v-if="description">
                                <p class="text-sm text-zinc-500">
                                    {{ description }}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                        <span class="block sm:ml-3">
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
                </div>
            </div>
        </div>
    </LTeleport>
</template>
