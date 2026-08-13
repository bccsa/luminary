import { useRouter } from "vue-router";

/**
 * Shared "back" button logic. The button is a real `<a href>` via RouterLink's `custom` slot,
 * pointing home, so it works with JS disabled and during SSR/pre-hydration. The click handler
 * only ever runs once Vue has hydrated, so it can unconditionally prefer real history back.
 */
export function useBackNavigation() {
    const router = useRouter();

    const onBackClick = (e: MouseEvent) => {
        e.preventDefault();
        router.back();
    };

    return { onBackClick };
}
