import { inject, onMounted, onUnmounted } from "vue";
import { ScreenWakeKey } from "@/build-time/contracts/screen-wake/token";

/** How long the display is held on after the last interaction. */
export const KEEP_AWAKE_IDLE_MS = 2 * 60 * 1000;

// Captured at the document: scroll doesn't bubble, and the page scrolls an inner
// container rather than the window.
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchmove"] as const;
const LISTENER_OPTIONS = { capture: true, passive: true } as const;

// Watching a video is activity without input.
function isVideoPlaying(): boolean {
    return Array.from(document.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
}

/**
 * Holds the display on while the calling component is mounted, releasing it to the OS
 * once the user has been idle for `idleMs` and taking it back on the next interaction.
 */
export function useKeepScreenAwake(idleMs = KEEP_AWAKE_IDLE_MS): void {
    const screenWake = inject(ScreenWakeKey, undefined);

    let awake = false;
    let lastActivity = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function setAwake(value: boolean) {
        if (awake === value) return;
        awake = value;
        screenWake?.setKeepAwake(value);
    }

    function checkIdle() {
        if (isVideoPlaying()) lastActivity = Date.now();
        const idleFor = Date.now() - lastActivity;
        if (idleFor >= idleMs) {
            timer = undefined;
            setAwake(false);
            return;
        }
        timer = setTimeout(checkIdle, idleMs - idleFor);
    }

    // Activity only stamps the time; the pending timer re-reads it when it fires, so
    // a burst of scroll events doesn't churn timers.
    function onActivity() {
        lastActivity = Date.now();
        setAwake(true);
        timer ??= setTimeout(checkIdle, idleMs);
    }

    function onVisibilityChange() {
        if (document.visibilityState === "visible") onActivity();
    }

    onMounted(() => {
        for (const event of ACTIVITY_EVENTS) {
            document.addEventListener(event, onActivity, LISTENER_OPTIONS);
        }
        document.addEventListener("visibilitychange", onVisibilityChange);
        onActivity();
    });

    onUnmounted(() => {
        for (const event of ACTIVITY_EVENTS) {
            document.removeEventListener(event, onActivity, LISTENER_OPTIONS);
        }
        document.removeEventListener("visibilitychange", onVisibilityChange);
        clearTimeout(timer);
        timer = undefined;
        setAwake(false);
    });
}
