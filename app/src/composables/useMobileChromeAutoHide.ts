import { ref } from "vue";

/** Scroll distance from the top below which the chrome always stays visible. */
const SHOW_NEAR_TOP_PX = 80;
/** Minimum movement in one direction before the chrome reacts, so jitter doesn't toggle it. */
const DIRECTION_THRESHOLD_PX = 12;

// Shared across the app shell: the page that owns the scroll container reports scrolling,
// while the top bar (BasePage) and the bottom menu (App.vue) read the result.
const hidden = ref(false);
let lastScrollTop = 0;

/**
 * Mobile chrome that steps out of the way while reading: hides once the reader scrolls
 * down, comes back as soon as they scroll up or return to the top.
 */
export function useMobileChromeAutoHide() {
    function onScroll(scrollTop: number) {
        const delta = scrollTop - lastScrollTop;

        if (scrollTop <= SHOW_NEAR_TOP_PX) {
            hidden.value = false;
            lastScrollTop = scrollTop;
            return;
        }
        if (Math.abs(delta) < DIRECTION_THRESHOLD_PX) return;

        hidden.value = delta > 0;
        lastScrollTop = scrollTop;
    }

    function reset() {
        hidden.value = false;
        lastScrollTop = 0;
    }

    return { hidden, onScroll, reset };
}
