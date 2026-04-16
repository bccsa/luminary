<script setup lang="ts">
import { computed } from "vue";
import { XCircleIcon } from "@heroicons/vue/20/solid";
import type { Validation } from "../content/ContentValidator";

const props = defineProps<{
    errors: string[];
    validations?: Validation[];
}>();

const failedValidations = computed(() =>
    (props.validations ?? []).filter((v) => !v.isValid),
);
</script>

<template>
    <div v-if="errors?.length || failedValidations.length" class="mb-3">
        <div
            v-for="(error, idx) in errors"
            :key="'err-' + idx"
            class="mb-1 flex items-center gap-2"
        >
            <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
            <p class="text-xs text-zinc-700">{{ error }}</p>
        </div>
        <div
            v-for="v in failedValidations"
            :key="v.id"
            class="mb-1 flex items-center gap-2"
        >
            <XCircleIcon class="h-4 w-4 flex-shrink-0 text-red-400" />
            <p class="text-xs text-zinc-700">{{ v.message }}</p>
        </div>
    </div>
</template>
