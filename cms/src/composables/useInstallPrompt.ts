import { ref } from "vue";

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

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstallable = ref(false);
const isInstalled = ref(isInstalledStandalone());

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
    return { isInstallable, isInstalled, promptInstall };
}
