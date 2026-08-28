import { describe, expect, it } from "vitest";
import { isDeleteCmdSuperseded } from "./deleteCmdStaleness";

describe("isDeleteCmdSuperseded", () => {
    it("is not superseded when the target is gone — the ordinary delete", () => {
        expect(isDeleteCmdSuperseded({ updatedTimeUtc: 100 }, undefined)).toBe(false);
    });

    it("is not superseded when the target predates the cmd", () => {
        expect(isDeleteCmdSuperseded({ updatedTimeUtc: 100 }, { updatedTimeUtc: 99 })).toBe(false);
    });

    it("is superseded when the target was rewritten after the cmd (unpublish → republish)", () => {
        expect(isDeleteCmdSuperseded({ updatedTimeUtc: 100 }, { updatedTimeUtc: 101 })).toBe(true);
    });

    it("treats an equal timestamp as superseded, so a same-millisecond write keeps the doc", () => {
        expect(isDeleteCmdSuperseded({ updatedTimeUtc: 100 }, { updatedTimeUtc: 100 })).toBe(true);
    });
});
