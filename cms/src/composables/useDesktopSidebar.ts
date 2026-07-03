import { ref, watch } from "vue";

const STORAGE_KEY = "desktop-sidebar-collapsed";

const collapsed = ref(
    typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
);

watch(collapsed, (value) => {
    localStorage.setItem(STORAGE_KEY, String(value));
});

export function useDesktopSidebar() {
    function toggleCollapsed() {
        collapsed.value = !collapsed.value;
    }

    return { collapsed, toggleCollapsed };
}
