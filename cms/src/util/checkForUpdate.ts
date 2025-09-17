import { useNotificationStore } from "@/stores/notification";

// Version / update check (after app boot so notification store exists)
const VERSION_STORAGE_KEY = "app_version";
let updateNotified = false;
export async function checkForUpdate(showIfSame = false) {
    try {
        const res = await fetch(`/version.json`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { hash?: string };
        if (!data?.hash) return;
        const current = localStorage.getItem(VERSION_STORAGE_KEY);
        if (current && current !== data.hash && !updateNotified) {
            updateNotified = true;
            useNotificationStore().addNotification({
                title: "Update available",
                description:
                    "Good news! A new version of the CMS is ready. Click here to reload and apply the update.",
                state: "warning",
                timer: 60000,
                click: () => {
                    // Persist new version and reload
                    data.hash && localStorage.setItem(VERSION_STORAGE_KEY, data.hash);
                    location.reload();
                },
            });
        } else if (showIfSame && !current) {
            // first load, store silently
        }
        localStorage.setItem(VERSION_STORAGE_KEY, data.hash);
    } catch (e) {
        // ignore
    }
}
