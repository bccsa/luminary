<script lang="ts">
export default {
    inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { computed, type Component, type StyleValue, ref } from "vue";
import { useId } from "@/util/useId";
import { useAttrsWithoutStyles } from "@/composables/attrsWithoutStyles";
import { ExclamationCircleIcon } from "@heroicons/vue/20/solid";
import FormLabel from "./FormLabel.vue";
import FormMessage from "./FormMessage.vue";
import { useField } from "vee-validate";
import { renderErrorMessage } from "@/util/renderErrorMessage";

type Props = {
    name: string;
    modelValue?: string;
    state?: keyof typeof states;
    size?: keyof typeof sizes;
    label?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    icon?: Component | Function;
    fullHeight?: boolean;
    leftAddOn?: string;
    rightAddOn?: string;
};

const props = withDefaults(defineProps<Props>(), {
    state: "default",
    size: "base",
    required: false,
    disabled: false,
    fullHeight: false,
});

// Expose the focus method to parent components.
const input = ref<HTMLInputElement | undefined>(undefined);
const focus = () => {
    input.value?.focus();
};
defineExpose({ focus });

const { errorMessage, value, handleBlur, handleChange } = useField(() => props.name, undefined, {
    syncVModel: true,
    validateOnValueUpdate: false,
});

// Initially and if field is valid, only validate when user leaves field.
// If the field is invalid, validate as user is typing.
const validationListeners = {
    blur: (e: any) => handleBlur(e, true),
    change: handleChange,
    input: (e: any) => handleChange(e, !!errorMessage.value),
};

const computedState = computed(() => {
    if (errorMessage.value) {
        return "error";
    }

    return props.state;
});

const states = {
    default:
        "text-zinc-900 ring-zinc-300 placeholder:text-zinc-400 hover:ring-zinc-400 focus:ring-zinc-950",
    error: "text-red-900 bg-red-50 ring-red-300 placeholder:text-red-300 hover:ring-red-400 focus:ring-red-500",
};

const addOnStates = {
    default: "border-zinc-300 px-3 text-zinc-500",
    error: "border-red-300 bg-red-50 px-3 text-red-600",
};

const sizes = {
    sm: "py-1",
    base: "py-1.5",
    lg: "py-2.5",
};

const id = `l-input-${useId()}`;
const { attrsWithoutStyles } = useAttrsWithoutStyles();
</script>

<template>
    <div :class="$attrs['class']" :style="$attrs['style'] as StyleValue">
        <FormLabel v-if="label" :for="id" :required="required" class="mb-2">
            {{ label }}
        </FormLabel>
        <div class="relative flex rounded-md shadow-sm" :class="fullHeight ? 'h-full' : ''">
            <div
                v-if="icon"
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
            >
                <component
                    :is="icon"
                    class="h-5 w-5"
                    :class="{
                        'text-zinc-400': state == 'default' && !disabled,
                        'text-zinc-300': state == 'default' && disabled,
                        'text-red-400': state == 'error',
                    }"
                />
            </div>
            <span
                v-if="leftAddOn"
                class="inline-flex items-center rounded-l-md border border-r-0 px-3 sm:text-sm"
                :class="[addOnStates[computedState]]"
            >
                {{ leftAddOn }}
            </span>
            <input
                ref="input"
                v-model="value"
                v-on="validationListeners"
                :class="[
                    sizes[size],
                    states[computedState],
                    {
                        'rounded-l-md': !leftAddOn,
                        'rounded-r-md': !rightAddOn,
                        'pl-10': icon,
                        'pr-10': state == 'error',
                    },
                    'block w-full border-0 ring-1 ring-inset focus:ring-2 focus:ring-inset disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 disabled:ring-zinc-200 sm:text-sm sm:leading-6',
                ]"
                :id="id"
                :name="name"
                :disabled="disabled"
                :required="required"
                :placeholder="placeholder"
                v-bind="attrsWithoutStyles"
                :aria-describedby="$slots.default ? `${id}-message` : undefined"
            />
            <span
                v-if="rightAddOn"
                class="inline-flex items-center rounded-r-md border border-l-0 px-3 sm:text-sm"
                :class="[addOnStates[computedState]]"
            >
                {{ rightAddOn }}
            </span>
            <div
                v-if="computedState == 'error' && !rightAddOn"
                class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"
            >
                <ExclamationCircleIcon class="h-5 w-5 text-red-500" aria-hidden="true" />
            </div>
        </div>
        <FormMessage
            v-if="$slots.default || errorMessage"
            :state="computedState"
            :id="`${id}-message`"
        >
            <template v-if="errorMessage">{{ renderErrorMessage(errorMessage) }}</template>
            <slot v-else-if="$slots.default" />
        </FormMessage>
    </div>
</template>
