import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { autoplayDownloadedOnly, autoplayModeFor, useAutoplayMode } from "../autoplayMode";
import { downloadsServiceStub } from "./downloadsStub";

beforeEach(() => {
    autoplayDownloadedOnly.value = false;
});

describe("autoplayModeFor", () => {
    it.each([
        [false, true, "all"],
        [true, true, "downloaded"],
        [false, false, "downloaded"],
        [true, false, "downloaded"],
    ] as const)("downloaded only %s, online %s: %s", (downloadedOnly, online, mode) => {
        expect(autoplayModeFor(downloadedOnly, online)).toBe(mode);
    });
});

describe("autoplayDownloadedOnly", () => {
    it("is kept beside the autoplay setting, in the same storage", async () => {
        autoplayDownloadedOnly.value = true;
        await nextTick();
        expect(localStorage.getItem("autoplayDownloadedOnly")).toBe("true");
        autoplayDownloadedOnly.value = false;
        await nextTick();
        expect(localStorage.getItem("autoplayDownloadedOnly")).toBe("false");
    });
});

describe("useAutoplayMode", () => {
    it("is nothing without downloads", () => {
        expect(useAutoplayMode(undefined)).toBeUndefined();
    });

    it("follows the setting while online, and lets the viewer change it", () => {
        const autoplay = useAutoplayMode(downloadsServiceStub())!;
        expect(autoplay.mode.value).toBe("all");
        expect(autoplay.locked.value).toBe(false);
        autoplay.choose("downloaded");
        expect(autoplayDownloadedOnly.value).toBe(true);
        expect(autoplay.mode.value).toBe("downloaded");
    });

    it("forces downloaded offline and locks the choice, then gives back the viewer's own", () => {
        const service = downloadsServiceStub({ network: { online: false, metered: false } });
        const autoplay = useAutoplayMode(service)!;
        expect(autoplay.mode.value).toBe("downloaded");
        expect(autoplay.locked.value).toBe(true);
        autoplay.choose("downloaded");
        expect(autoplayDownloadedOnly.value).toBe(false);

        service.networkRef.value = { online: true, metered: false };
        expect(autoplay.mode.value).toBe("all");
        expect(autoplay.locked.value).toBe(false);
    });
});
