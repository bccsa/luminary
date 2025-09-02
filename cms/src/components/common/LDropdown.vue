<script lang="ts" setup>
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";
import LTeleport from "./LTeleport.vue";

const shouldShowDropdown = defineModel<boolean>("shouldShowDropdown", { required: true });
const dropdownElementRef = ref<HTMLElement | null>(null);

onClickOutside(dropdownElementRef, () => {
    shouldShowDropdown.value = false;
});
</script>

<template>
    <LTeleport>
        <div ref="dropdownElementRef">
            <div
                v-show="shouldShowDropdown"
                class="w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            >
                <slot />
            </div>
        </div>
    </LTeleport>
</template>
