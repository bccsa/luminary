import { computed, onMounted, ref } from "vue";

/**
 * True immediately in the native SPA and after the first client mount in the
 * web/SSG build. Use it for client-only UI that must not participate in SSR
 * hydration.
 */
export function useHydrated() {
    const isWeb = import.meta.env.VITE_BUILD_TARGET === "web";
    const isHydrated = ref(!isWeb);

    onMounted(() => {
        isHydrated.value = true;
    });

    return computed(() => isHydrated.value);
}
