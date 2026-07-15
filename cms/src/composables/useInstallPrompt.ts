import { computed, ref } from "vue";

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isInstalledStandalone = () => {
    if (typeof window === "undefined") return false;
    if ((window.navigator as any).standalone === true) return true;
    if (typeof window.matchMedia !== "function") return false;
    return ["standalone", "minimal-ui", "fullscreen"].some(
        (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    );
};

const getManualInstallInstructions = () => {
    if (typeof window === "undefined") return null;

    const { navigator } = window;
    const userAgent = navigator.userAgent;
    const isIos =
        /iPad|iPhone|iPod/.test(userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(userAgent);

    if (isIos) {
        return isSafari
            ? "To install, tap Share, then Add to Home Screen."
            : "To install, open this app in Safari, then tap Share and choose Add to Home Screen.";
    }

    if (isSafari) {
        return "To install, click the Share icon in Safari's toolbar, then choose Add to Dock.";
    }

    return null;
};

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstallable = ref(false);
const isInstalled = ref(isInstalledStandalone());
const manualInstallInstructions = computed(() =>
    isInstalled.value ? null : getManualInstallInstructions(),
);

if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt.value = e as BeforeInstallPromptEvent;
        isInstallable.value = true;
    });

    window.addEventListener("appinstalled", () => {
        isInstalled.value = true;
        isInstallable.value = false;
        deferredPrompt.value = null;
    });
}

async function promptInstall() {
    if (!deferredPrompt.value) return;

    try {
        await deferredPrompt.value.prompt();
        await deferredPrompt.value.userChoice;
    } finally {
        deferredPrompt.value = null;
        isInstallable.value = false;
    }
}

export function useInstallPrompt() {
    return { isInstallable, isInstalled, manualInstallInstructions, promptInstall };
}
