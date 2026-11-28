import { ref } from "vue";

/**
 * How many side panels are open. The platform's mini-player is drawn above the whole page, so it steps aside while
 * one is.
 */
export const sidePanelsOpen = ref(0);
