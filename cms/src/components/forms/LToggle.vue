<script setup lang="ts">
import { Switch } from "@headlessui/vue";
import { computed, toRefs } from "vue";

type Props = {
    modelValue: boolean;
    disabled?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const { modelValue, disabled } = toRefs(props);

const emit = defineEmits(["update:modelValue"]);

const toggled = computed({
    get() {
        return !!modelValue.value;
    },
    set(value: boolean) {
        emit("update:modelValue", value);
    },
});
</script>
<template>
    <Switch
        v-model="toggled"
        :disabled="disabled"
        :class="[
            'relative inline-flex h-6 w-24 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2',
            {
                'cursor-pointer': !disabled,
                'bg-zinc-500': disabled && toggled,
                'bg-zinc-100': disabled && !toggled,
                'bg-green-400': !disabled && toggled,
                'bg-red-400': !disabled && !toggled,
            },
        ]"
    >
        <span class="sr-only">Toggle</span>
        <span
            :class="[
                'pointer-events-none relative inline-block h-5 w-1/2 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                toggled ? 'translate-x-12 bg-green-800 text-[10px]' : 'translate-x-0 bg-red-800',
            ]"
        >
            <span
                :class="[
                    'absolute inset-0 flex h-full w-full items-center justify-center text-black transition-opacity',
                    toggled
                        ? 'opacity-0 duration-100 ease-out'
                        : 'opacity-100 duration-200 ease-in',
                ]"
                aria-hidden="true"
            >
                Draft
            </span>
            <span
                :class="[
                    'absolute inset-0 flex h-full w-full items-center justify-center text-black transition-opacity',
                    toggled
                        ? 'opacity-100 duration-200 ease-in'
                        : 'opacity-0 duration-100 ease-out',
                ]"
                aria-hidden="true"
            >
                Publish
            </span>
        </span>
    </Switch>
</template>
