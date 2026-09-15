import { ref } from "vue";
import type { AppUpdateService } from "@/build-time/contracts/app-update/contract";

/**
 * Browser {@link AppUpdateService}: the site always loads its latest version, so there is
 * no installed version and no store to send the user to.
 */
export class WebAppUpdateService implements AppUpdateService {
    readonly installedVersion = ref<string | undefined>(undefined);
    readonly storeVersion = ref<string | undefined>(undefined);
    readonly storeCheckedAt = ref<number | undefined>(undefined);

    openStore(): void {
        // Browsers pick up new versions on their own.
    }
}
