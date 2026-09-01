import { beforeEach, describe, expect, it } from "vitest";
import { affinityDebugEnabled, applyAffinityDebugQuery } from "./affinityDebug";

describe("applyAffinityDebugQuery", () => {
    beforeEach(() => {
        sessionStorage.clear();
        affinityDebugEnabled.value = false;
    });

    it("enables the overlay on a bare param or any non-off value", () => {
        applyAffinityDebugQuery("true");
        expect(affinityDebugEnabled.value).toBe(true);

        affinityDebugEnabled.value = false;
        applyAffinityDebugQuery(null);
        expect(affinityDebugEnabled.value).toBe(true);

        affinityDebugEnabled.value = false;
        applyAffinityDebugQuery("1");
        expect(affinityDebugEnabled.value).toBe(true);
    });

    it("leaves the flag alone when the param is absent, so it survives navigation", () => {
        applyAffinityDebugQuery("true");
        applyAffinityDebugQuery(undefined);

        expect(affinityDebugEnabled.value).toBe(true);
    });

    it("switches the overlay off on an explicit off value", () => {
        applyAffinityDebugQuery("true");
        applyAffinityDebugQuery("false");

        expect(affinityDebugEnabled.value).toBe(false);
        expect(sessionStorage.getItem("affinityDebugOverlay")).toBe(null);
    });

    it("persists the flag for the rest of the session", () => {
        applyAffinityDebugQuery("true");

        expect(sessionStorage.getItem("affinityDebugOverlay")).toBe("true");
    });

    it("uses the last value of a repeated param", () => {
        applyAffinityDebugQuery(["true", "false"]);

        expect(affinityDebugEnabled.value).toBe(false);
    });
});
