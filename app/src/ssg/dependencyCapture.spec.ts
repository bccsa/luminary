import { afterEach, describe, expect, it } from "vitest";
import { reportKeys } from "./dependencyCapture";

type CaptureState = {
    current: Set<string>;
    manifest: Record<string, string[]>;
};

const GLOBAL_KEY = "__SSG_DEPS__";
const globalCapture = () => (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
    | CaptureState
    | undefined;

describe("dependencyCapture", () => {
    afterEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    });

    it("is a no-op when no capture is active (client/native build)", () => {
        expect(globalCapture()).toBeUndefined();
        expect(() => reportKeys(["doc:p1"])).not.toThrow();
        expect(globalCapture()).toBeUndefined();
    });

    it("adds reported keys to the active capture's current set", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
            current: new Set<string>(),
            manifest: {},
        } as CaptureState;

        reportKeys(["doc:p1", "facet:parentId:p1:lang-eng"]);

        expect([...globalCapture()!.current]).toEqual(["doc:p1", "facet:parentId:p1:lang-eng"]);
    });

    it("de-duplicates keys across multiple reportKeys calls (a Set, not a list)", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
            current: new Set<string>(),
            manifest: {},
        } as CaptureState;

        reportKeys(["doc:p1"]);
        reportKeys(["doc:p1", "doc:p2"]);

        expect([...globalCapture()!.current]).toEqual(["doc:p1", "doc:p2"]);
    });

    it("never touches the manifest — that's the config side's job (vite.config.web.ts)", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
            current: new Set<string>(),
            manifest: { "/already-rendered": ["doc:old"] },
        } as CaptureState;

        reportKeys(["doc:new"]);

        expect(globalCapture()!.manifest).toEqual({ "/already-rendered": ["doc:old"] });
    });
});
