import { computed, inject } from "vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { isNewerVersion } from "@/util/appVersion";

/**
 * The installed app version and the newer store version, when there is one.
 * Versions stay `undefined` where the app isn't installed from a store.
 */
export function useAppUpdate() {
    const service = inject(AppUpdateKey, undefined);

    const installedVersion = computed(() => service?.installedVersion.value);
    const storeVersion = computed(() => service?.storeVersion.value);
    const storeCheckedAt = computed(() => service?.storeCheckedAt.value);
    const isUpdateAvailable = computed(
        () =>
            !!installedVersion.value &&
            !!storeVersion.value &&
            isNewerVersion(storeVersion.value, installedVersion.value),
    );

    return {
        installedVersion,
        storeVersion,
        storeCheckedAt,
        isUpdateAvailable,
        openStore: () => service?.openStore(),
    };
}
