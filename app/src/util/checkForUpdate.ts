import LButton from "@/components/button/LButton.vue";
import { useNotificationStore } from "@/stores/notification";
import { h } from "vue";
import { useI18n } from "vue-i18n";

// Version / update check (after app boot so notification store exists)
const VERSION_STORAGE_KEY = "app_version";
let updateNotified = false;

// Note: useI18n() must be called within a component setup context.
// We'll lazily resolve a translator function when first invoked from a component.
let translator: ((k: string) => string) | null = null;
function getT() {
    try {
        if (!translator) {
            const { t } = useI18n();
            translator = t;
        }
    } catch {
        // Fallback if called before i18n plugin is ready
        translator = (k: string) => k;
    }
    return translator!;
}

export async function checkForUpdate(showIfSame = false) {
    try {
        const res = await fetch(`/version.json`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { hash?: string };
        // Removed improper use of useI18n outside setup
        const current = localStorage.getItem(VERSION_STORAGE_KEY);
        if (current && current !== data.hash && !updateNotified) {
            updateNotified = true;
            const t = getT();
            useNotificationStore().addNotification({
                title: t("new_update.available.title"),
                description: t("new_update.available.description"),
                state: "warning",
                timeout: 60000,
                priority: 0,
                type: "bottom",
                actions: () => {
                    const t2 = getT();
                    return h(
                        "div",
                        {
                            class: "flex flex-col items-stretch space-y-2 mt-2 md:flex-row md:items-center md:space-y-0 md:space-x-2",
                        },
                        [
                            h(
                                LButton,
                                {
                                    variant: "primary",
                                    name: "reload",
                                    onClick: () => location.reload(),
                                },
                                () => t2("new_update.available.reload_button") || "Reload",
                            ),
                        ],
                    );
                },
            });
        } else if (showIfSame && !current) {
            // first load, store silently
        }
        if (data.hash) localStorage.setItem(VERSION_STORAGE_KEY, data.hash);
    } catch (e) {
        // ignore
    }
}
