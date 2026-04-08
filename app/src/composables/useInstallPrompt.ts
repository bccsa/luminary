import { ref } from "vue";

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstallable = ref(false);
const isInstalled = ref(
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
);

window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
    isInstallable.value = true;
});

window.addEventListener("appinstalled", () => {
    deferredPrompt.value = null;
    isInstallable.value = false;
    isInstalled.value = true;
});

export function useInstallPrompt() {
    const install = async () => {
        if (!deferredPrompt.value) return;
        deferredPrompt.value.prompt();
        const { outcome } = await deferredPrompt.value.userChoice;
        if (outcome === "accepted") {
            deferredPrompt.value = null;
            isInstallable.value = false;
        }
    };

    return {
        isInstallable,
        isInstalled,
        install,
    };
}
