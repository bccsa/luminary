import { describe, it, expect } from "vitest";
import * as luminaryShared from "./index";

describe("package index exports", () => {
    it("re-exports the retention helpers as functions", () => {
        expect(typeof luminaryShared.touchRetention).toBe("function");
        expect(typeof luminaryShared.flushRetention).toBe("function");
        expect(typeof luminaryShared.evictStaleBelowCutoff).toBe("function");
    });

    it("re-exports isSyncableDoc as a function", () => {
        expect(typeof luminaryShared.isSyncableDoc).toBe("function");
    });
});
