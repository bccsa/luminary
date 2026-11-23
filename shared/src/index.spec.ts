import { describe, it, expect } from "vitest";
import * as luminaryShared from "./index";

describe("package index exports", () => {
    it("re-exports the retention helpers as functions", () => {
        expect(typeof luminaryShared.touchRetention).toBe("function");
        expect(typeof luminaryShared.flushRetention).toBe("function");
        expect(typeof luminaryShared.evictStaleBelowCutoff).toBe("function");
        expect(typeof luminaryShared.pinRetention).toBe("function");
        expect(typeof luminaryShared.unpinRetention).toBe("function");
        expect(typeof luminaryShared.getRetainUntil).toBe("function");
        expect(typeof luminaryShared.getPinnedRetentionIds).toBe("function");
    });

    it("re-exports onDocsDeletedByCommand and fetchHlsKeyOutcome as functions", () => {
        expect(typeof luminaryShared.onDocsDeletedByCommand).toBe("function");
        expect(typeof luminaryShared.fetchHlsKeyOutcome).toBe("function");
    });

    it("re-exports isSyncableDoc as a function", () => {
        expect(typeof luminaryShared.isSyncableDoc).toBe("function");
    });
});
