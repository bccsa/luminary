import { computed } from "vue";
import { useRouter } from "vue-router";
import { getRouteHistory } from "@/router";

/**
 * Shared "back" button logic. The button is a real `<a href>` via RouterLink's `custom` slot so it works with JS disabled; with JS, real history back is preferred when available.
 */
export function useBackNavigation() {
    const router = useRouter();

    const isPostAndNoHistory = computed(
        () => getRouteHistory().value.length <= 1 && router.currentRoute.value.name === "content",
    );

    const onBackClick = (navigate: (e?: MouseEvent) => void, e: MouseEvent) => {
        if (isPostAndNoHistory.value) {
            navigate(e);
            return;
        }
        e.preventDefault();
        router.back();
    };

    return { isPostAndNoHistory, onBackClick };
}
