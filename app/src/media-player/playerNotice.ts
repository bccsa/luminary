import { shallowRef } from "vue";

/**
 * A notice the player raises about what it plays. The media player shows it on the platform's now-playing screen
 * while that screen is up, else as a toast.
 */
export type PlayerNotice = {
    id: string;
    text: string;
    /** The button, and what it does. */
    action?: { label: string; run: () => void };
    /** What closing it does, beyond taking it away. */
    onDismiss?: () => void;
};

/** The notice up now; a new one replaces it. */
export const playerNotice = shallowRef<PlayerNotice | null>(null);

let sequence = 0;

/** Raises a notice and returns its id. */
export function showPlayerNotice(notice: Omit<PlayerNotice, "id">): string {
    const id = `player-notice-${++sequence}`;
    playerNotice.value = { id, ...notice };
    return id;
}

/** Takes the notice away without acting on it; with an id, only that one. */
export function clearPlayerNotice(id?: string): void {
    if (!id || playerNotice.value?.id === id) playerNotice.value = null;
}

/** The viewer used the notice's button. */
export function actOnPlayerNotice(id: string | undefined): void {
    const notice = playerNotice.value;
    if (!notice || notice.id !== id) return;
    playerNotice.value = null;
    notice.action?.run();
}

/** The viewer closed the notice. */
export function dismissPlayerNotice(id: string | undefined): void {
    const notice = playerNotice.value;
    if (!notice || notice.id !== id) return;
    playerNotice.value = null;
    notice.onDismiss?.();
}
