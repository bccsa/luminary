<script setup lang="ts">
import { computed, inject } from "vue";
import { AppPromoKey } from "@/build-time/contracts/app-promo/token";
import type { AppPromoPlacement } from "@/build-time/contracts/app-promo/contract";

const props = defineProps<{ placement: AppPromoPlacement }>();

const promo = inject(AppPromoKey, undefined);
const promoComponent = computed(() => promo?.component(props.placement));
</script>

<template>
    <component :is="promoComponent" v-if="promoComponent" />
</template>
