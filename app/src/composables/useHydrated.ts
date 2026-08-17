import { computed, onMounted, ref } from "vue";

/**
 * True immediately in the normal SPA and after the first client mount in the
 * SSG build. Use it for client-only UI that must not participate in SSR
 * hydration.
 */
export function useHydrated() {
    const isSSG = import.meta.env.VITE_BUILD_TARGET === "web";
    const isHydrated = ref(!isSSG);

    onMounted(() => {
        isHydrated.value = true;
    });

    return computed(() => isHydrated.value);
}
