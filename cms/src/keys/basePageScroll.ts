import type { InjectionKey, Ref } from "vue";

/** Scroll container for {@link BasePage}'s main content area. */
export const basePageScrollKey: InjectionKey<Ref<HTMLElement | null>> = Symbol("basePageScroll");
