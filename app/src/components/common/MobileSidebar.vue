<script setup lang="ts">
import { onUnmounted, watch } from "vue";
import LTeleport from "./LTeleport.vue";

const open = defineModel<boolean>("open", { required: true });

function close() {
    open.value = false;
}

function handleEscape(e: KeyboardEvent) {
    if (e.key === "Escape") close();
}

watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener("keydown", handleEscape);
    } else {
        document.removeEventListener("keydown", handleEscape);
    }
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleEscape);
});
</script>

<template>
    <LTeleport>
        <Transition name="sidebar-backdrop">
            <div
                v-if="open"
                class="fixed inset-0 z-[60] touch-none bg-black/50"
                @click="close"
            />
        </Transition>
        <Transition name="sidebar-slide">
            <aside
                v-if="open"
                class="fixed inset-y-0 right-0 z-[70] flex w-60 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-800"
                role="dialog"
                aria-modal="true"
            >
                <slot
                    name="header"
                    :close="close"
                />
                <div class="flex-1 overflow-y-auto overscroll-contain">
                    <slot :close="close" />
                </div>
            </aside>
        </Transition>
    </LTeleport>
</template>

<style scoped>
.sidebar-backdrop-enter-active,
.sidebar-backdrop-leave-active {
    transition: opacity 0.2s ease;
}
.sidebar-backdrop-enter-from,
.sidebar-backdrop-leave-to {
    opacity: 0;
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
    transition: transform 0.3s ease;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
    transform: translateX(100%);
}
</style>
