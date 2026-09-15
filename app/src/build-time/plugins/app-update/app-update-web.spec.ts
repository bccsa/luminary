import { describe, expect, it } from "vitest";
import { WebAppUpdateService } from "./app-update-web";

describe("WebAppUpdateService", () => {
    it("reports no installed version, store version or store check", () => {
        const service = new WebAppUpdateService();

        expect(service.installedVersion.value).toBeUndefined();
        expect(service.storeVersion.value).toBeUndefined();
        expect(service.storeCheckedAt.value).toBeUndefined();
    });

    it("has no store to open", () => {
        const service = new WebAppUpdateService();

        expect(() => service.openStore()).not.toThrow();
    });
});
