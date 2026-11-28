<script setup lang="ts">
import { onUnmounted, watch } from "vue";
import LTeleport from "./LTeleport.vue";
import { sidePanelsOpen } from "@/composables/sidePanelsOpen";

const open = defineModel<boolean>("open", { required: true });

withDefaults(
    defineProps<{
        /** Panel width. A Tailwind class, since the cap below is kept whatever it is. */
        widthClass?: string;
    }>(),
    { widthClass: "w-60" },
);

function close() {
    open.value = false;
}

function handleEscape(e: KeyboardEvent) {
    if (e.key === "Escape") close();
}

let counted = false;
function count(isOpen: boolean) {
    if (isOpen === counted) return;
    counted = isOpen;
    sidePanelsOpen.value += isOpen ? 1 : -1;
}
if (open.value) count(true);

watch(open, (isOpen) => {
    // Closing lets go of the mini-player near the end of the slide-out: released at once, the native bar showed over
    // the panel; released after it, the bar came back late. The native bar's own show covers the last stretch.
    clearTimeout(release);
    if (isOpen) count(true);
    else release = setTimeout(() => count(false), RELEASE_MS);
    if (isOpen) {
        document.addEventListener("keydown", handleEscape);
    } else {
        document.removeEventListener("keydown", handleEscape);
    }
});

/** Of the 300 ms slide-out: by now the ease has the panel nearly off the screen. */
const RELEASE_MS = 200;
let release: ReturnType<typeof setTimeout> | undefined;

onUnmounted(() => {
    clearTimeout(release);
    count(false);
    document.removeEventListener("keydown", handleEscape);
});
</script>

<template>
    <LTeleport>
        <Transition name="sidebar-backdrop">
            <div v-if="open" class="fixed inset-0 z-[60] touch-none bg-black/50" @click="close" />
        </Transition>
        <Transition name="sidebar-slide">
            <aside
                v-if="open"
                class="fixed inset-y-0 right-0 z-[70] flex max-w-[85vw] flex-col bg-white pb-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))] pt-[env(safe-area-inset-top)] shadow-xl dark:bg-slate-800"
                :class="widthClass"
                role="dialog"
                aria-modal="true"
            >
                <slot name="header" :close="close" />
                <div class="flex-1 overflow-y-auto overscroll-contain">
                    <slot :close="close" />
                </div>
                <slot name="footer" :close="close" />
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
