<template>
    <div class="relative h-3 w-1/2 overflow-hidden rounded-full border border-[#736d6d]">
        <div class="animate-loading-bar absolute left-0 top-0 h-full bg-[#e2d003]"></div>
    </div>
</template>

<style scoped>
@keyframes loading-bar {
    0% {
        width: 0%;
    }
    100% {
        width: 100%;
    }
}

.animate-loading-bar {
    animation: loading-bar 10s ease-in infinite;
}
</style>
