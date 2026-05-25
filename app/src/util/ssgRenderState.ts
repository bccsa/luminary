import { computed, ref, watch } from "vue";

export type SsgState = "loading" | "ready" | "error";

const appReady = ref(false);
const appError = ref(false);
const pageReady = ref<SsgState>("loading");

export const ssgState = computed<SsgState>(() => {
    if (appError.value || pageReady.value === "error") return "error";
    if (!appReady.value) return "loading";
    return pageReady.value;
});

export function markAppReady() {
    appError.value = false;
    appReady.value = true;
}

export function markAppError() {
    appError.value = true;
}

export function markPageLoading() {
    pageReady.value = "loading";
}

export function markPageReady() {
    pageReady.value = "ready";
}

export function markPageError() {
    pageReady.value = "error";
}

if (typeof document !== "undefined") {
    document.documentElement.dataset.ssgState = ssgState.value;
    watch(
        ssgState,
        (s) => {
            document.documentElement.dataset.ssgState = s;
            window.dispatchEvent(new CustomEvent("ssg-state-change", { detail: s }));
        },
        { flush: "post" },
    );
}
