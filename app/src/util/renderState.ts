import { computed, ref, watch } from "vue";

export type RenderState = "loading" | "ready" | "error";

const appReady = ref(false);
const appError = ref(false);
const pageReady = ref<RenderState>("loading");

export const renderState = computed<RenderState>(() => {
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
    document.documentElement.dataset.renderState = renderState.value;
    watch(
        renderState,
        (s) => {
            document.documentElement.dataset.renderState = s;
            window.dispatchEvent(new CustomEvent("render-state-change", { detail: s }));
        },
        { flush: "post" },
    );
}
