import { ref } from "vue";

export const userActivityVersion = ref(0);
export const highlightVersion = ref(0);

export function notifyHighlightsChanged(): void {
    highlightVersion.value++;
}

export function notifyUserActivityChanged(): void {
    userActivityVersion.value++;
    notifyHighlightsChanged();
}
