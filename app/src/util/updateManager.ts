import LButton from "@/components/button/LButton.vue";
import { useNotificationStore } from "@/stores/notification";
import { h } from "vue";
import { useI18n } from "vue-i18n";

// Version / update check (after app boot so notification store exists)
const VERSION_STORAGE_KEY = "app_version";
let updateNotified = false;

// const { t } = useI18n();

export async function checkForUpdate(showIfSame = false) {
    try {
        const res = await fetch(`/version.json`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { hash?: string };
        // Removed improper use of useI18n outside setup
        const current = localStorage.getItem(VERSION_STORAGE_KEY);
        if (current && current !== data.hash && !updateNotified) {
            updateNotified = true;
            useNotificationStore().addNotification({
                title: "Update available",
                description:
                    "Good news! A new version of the app is ready. Refresh or click the button to apply the update.",
                state: "warning",
                timeout: 200,
                priority: 0,
                type: "bottom",
                actions: () => {
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
                                () => "Reload",
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
