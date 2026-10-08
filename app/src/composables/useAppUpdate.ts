import { computed, inject } from "vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";

/** The installed app version and the newer version the user can update to, if any. */
export function useAppUpdate() {
    const service = inject(AppUpdateKey, undefined);

    const installedVersion = computed(() => service?.installedVersion.value);
    const available = computed(() => service?.available.value);
    const checkedAt = computed(() => service?.checkedAt.value);
    const isUpdateAvailable = computed(() => !!available.value);

    return {
        installedVersion,
        available,
        checkedAt,
        isUpdateAvailable,
        applyUpdate: () => service?.applyUpdate(),
    };
}
