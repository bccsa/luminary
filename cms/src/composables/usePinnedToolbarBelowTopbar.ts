import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import { computed, inject, onMounted, onUnmounted, ref, type Ref } from "vue";
import { basePageScrollKey } from "@/keys/basePageScroll";

/** Pin a toolbar with `position: fixed` just below [data-topbar] on mobile scroll. */
export function usePinnedToolbarBelowTopbar(
    toolbarEl: Ref<HTMLElement | null>,
    toolbarSentinel: Ref<HTMLElement | null>,
) {
    const scrollContainer = inject(basePageScrollKey, ref(null));
    const breakpoints = useBreakpoints(breakpointsTailwind);
    const isMobile = breakpoints.smaller("lg");

    const isPinned = ref(false);
    const placeholderHeight = ref(0);
    const pinnedStyle = ref<Record<string, string>>({});

    let toolbarHeight = 0;

    function syncTopbarHeight(topbar: HTMLElement) {
        const height = topbar.getBoundingClientRect().height;
        document.documentElement.style.setProperty("--cms-topbar-height", `${height}px`);
        return height;
    }

    function update() {
        if (!isMobile.value) {
            isPinned.value = false;
            placeholderHeight.value = 0;
            pinnedStyle.value = {};
            return;
        }

        const topbar = document.querySelector("[data-topbar]") as HTMLElement | null;
        const scrollEl = scrollContainer.value;
        const sentinel = toolbarSentinel.value;
        const toolbar = toolbarEl.value;

        if (!topbar || !scrollEl || !sentinel || !toolbar) {
            isPinned.value = false;
            placeholderHeight.value = 0;
            pinnedStyle.value = {};
            return;
        }

        syncTopbarHeight(topbar);
        toolbarHeight = toolbar.offsetHeight;

        const topbarBottom = topbar.getBoundingClientRect().bottom;
        const scrollRect = scrollEl.getBoundingClientRect();
        const shouldPin = sentinel.getBoundingClientRect().top <= topbarBottom;

        if (shouldPin) {
            isPinned.value = true;
            placeholderHeight.value = toolbarHeight;
            pinnedStyle.value = {
                top: `${topbarBottom}px`,
                left: `${scrollRect.left}px`,
                width: `${scrollRect.width}px`,
            };
        } else {
            isPinned.value = false;
            placeholderHeight.value = 0;
            pinnedStyle.value = {};
        }
    }

    onMounted(() => {
        document.addEventListener("scroll", update, { passive: true, capture: true });
        window.addEventListener("resize", update);
        requestAnimationFrame(update);
    });

    onUnmounted(() => {
        document.removeEventListener("scroll", update, { capture: true } as EventListenerOptions);
        window.removeEventListener("resize", update);
    });

    const toolbarClass = computed(() =>
        isPinned.value ? "fixed z-20 max-lg:shadow-sm" : "",
    );

    return {
        isPinned,
        placeholderHeight,
        pinnedStyle,
        toolbarClass,
        update,
    };
}
