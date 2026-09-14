import { describe, expect, it, vi } from "vitest";
import { ref, nextTick } from "vue";

const hidden = ref(false);
vi.mock("@/composables/useMobileChromeAutoHide", () => ({
    useMobileChromeAutoHide: () => ({ hidden }),
}));

import { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
import { providePlatformChrome } from "./provide";

describe("providePlatformChrome", () => {
    it("provides the service and mirrors mobile chrome visibility to the status bar", async () => {
        const provide = vi.fn();
        const setStatusBarHidden = vi.fn();
        const service = { chromeFadeEnabled: false, setStatusBarHidden };

        providePlatformChrome({ provide } as never, service);
        expect(provide).toHaveBeenCalledWith(PlatformChromeKey, service);

        hidden.value = true;
        await nextTick();
        expect(setStatusBarHidden).toHaveBeenLastCalledWith(true);

        hidden.value = false;
        await nextTick();
        expect(setStatusBarHidden).toHaveBeenLastCalledWith(false);
    });
});
