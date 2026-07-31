import { getCurrentInstance, onMounted, ref, watch } from "vue";

const STORAGE_KEY = "desktop-sidebar-collapsed";
const IS_SSG = import.meta.env.VITE_BUILD_TARGET === "web";

function readPersisted(): boolean {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
}

// On the SSG build `collapsed` starts `false` so the prerendered/hydration render matches; the persisted value is applied after mount. The normal SPA has no hydration, so it reads the persisted value immediately to avoid a startup flash.
const collapsed = ref(IS_SSG ? false : readPersisted());
let restored = !IS_SSG; // the normal SPA has nothing to restore post-mount

watch(collapsed, (value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, String(value));
});

export function useDesktopSidebar() {
    // SSG only: apply the persisted collapsed state after the first mount so the hydration render matches before localStorage is consulted. Guarded by getCurrentInstance so a non-setup caller doesn't trigger an onMounted warning.
    if (!restored && getCurrentInstance()) {
        onMounted(() => {
            if (restored) return;
            restored = true;
            collapsed.value = readPersisted();
        });
    }

    function toggleCollapsed() {
        collapsed.value = !collapsed.value;
    }

    return { collapsed, toggleCollapsed };
}
