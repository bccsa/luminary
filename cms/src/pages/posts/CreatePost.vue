<script setup lang="ts">
import { ref } from "vue";
import BasePage from "@/components/BasePage.vue";
import AcButton from "@/components/forms/AcButton.vue";
import AcInput from "@/components/forms/AcInput.vue";
import { EnvelopeIcon } from "@heroicons/vue/20/solid";

const input = ref("Test value");
</script>

<template>
    <BasePage title="Create Post"> Create Post form </BasePage>
</template>
