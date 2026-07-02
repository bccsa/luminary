import { getCurrentInstance, onMounted, ref, watch } from "vue";

const STORAGE_KEY = "desktop-sidebar-collapsed";
const IS_WEB = import.meta.env.VITE_BUILD_TARGET === "web";

function readPersisted(): boolean {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
}

// On the web/SSG build the sidebar is prerendered, so `collapsed` MUST start
// `false` on both the Node render and the first client (hydration) render —
// otherwise a previously-persisted `true` would change the width/labels on the
// client and trip a hydration mismatch. The persisted value is applied AFTER the
// first mount instead (see below). On native there is no hydration, so we read
// the persisted value immediately to avoid an expand→collapse startup flash.
const collapsed = ref(IS_WEB ? false : readPersisted());
let restored = !IS_WEB; // native has nothing to restore post-mount

watch(collapsed, (value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, String(value));
});

export function useDesktopSidebar() {
    // Web only: apply the persisted collapsed state once, after the first mount,
    // so the prerendered/hydration render (always expanded) matches before
    // localStorage is consulted. Guarded by getCurrentInstance so a non-setup
    // caller never triggers the onMounted warning.
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
