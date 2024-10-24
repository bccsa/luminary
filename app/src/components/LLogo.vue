<script setup lang="ts">
const logo = import.meta.env.VITE_LOGO_SVG;
</script>

<template>
    <div v-html="logo"></div>
</template>
