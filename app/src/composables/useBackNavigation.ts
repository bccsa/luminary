import { useRouter } from "vue-router";

/**
 * Shared "back" button logic. The button is a real `<a href>` via RouterLink's `custom` slot,
 * pointing home, so it works with JS disabled and during SSR/pre-hydration. Once hydrated, the
 * click prefers real history back, unless the current entry is the first one the router has
 * seen (deep link, external/WhatsApp link, direct open) — then it goes home instead.
 */
export function useBackNavigation() {
    const router = useRouter();

    // vue-router records the previous in-app location in history.state.back and leaves it null
    // on the first router-managed entry. window.history.length can't tell that apart inside a
    // webview, whose back-forward list may hold entries from outside the app.
    const canGoBack = () => Boolean(router.options.history.state?.back);

    const onBackClick = (e: MouseEvent) => {
        e.preventDefault();
        if (canGoBack()) router.back();
        else router.replace({ name: "home" });
    };

    return { onBackClick, canGoBack };
}
