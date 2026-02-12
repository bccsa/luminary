<script setup lang="ts">
import { computed, toRefs } from "vue";
import { FilmIcon } from "@heroicons/vue/24/outline";
import { MusicalNoteIcon } from "@heroicons/vue/24/solid";

type Props = {
    modelValue: boolean;
};

const props = defineProps<Props>();

const { modelValue } = toRefs(props);

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
    <div
        class="flex rounded-lg bg-zinc-500/70 hover:cursor-pointer"
        data-test="audio-video-toggle"
        @click="toggled = !toggled"
    >
        <div class="rounded-lg p-1" :class="[!toggled ? 'bg-zinc-900/60' : 'bg-transparent']">
            <FilmIcon
                class="h-6 w-6"
                :class="[!toggled ? 'text-white' : 'text-zinc-800']"
            ></FilmIcon>
        </div>
        <div class="rounded-lg p-1" :class="[toggled ? 'bg-zinc-900/60' : 'bg-transparent']">
            <MusicalNoteIcon
                class="h-6 w-6"
                :class="[toggled ? 'text-white' : 'text-zinc-800']"
            ></MusicalNoteIcon>
        </div>
    </div>
</template>
