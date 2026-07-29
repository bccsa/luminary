import { computed } from "vue";
import { useRouter } from "vue-router";
import { getRouteHistory } from "@/router";

/**
 * Shared logic behind the in-page "back" button (mobile TopBar + desktop pinned chrome
 * in BasePage). The button is rendered as a real `<a href>` (via RouterLink's `custom`
 * slot) so it still works with JS disabled — the anchor's own href takes a no-JS click
 * straight to the static home page. With JS, real browser-history "back" beats that
 * unless there's no history to go back to, in which case the anchor's home navigation
 * is left to run.
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
