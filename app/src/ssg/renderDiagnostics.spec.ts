import { describe, it, expect, afterEach } from "vitest";
import { reportRenderIssue, takeRenderIssues, type RenderIssue } from "./renderDiagnostics";

const GLOBAL_KEY = "__SSG_RENDER_ISSUES__";

describe("renderDiagnostics", () => {
    afterEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    });

    it("no-ops when no capture is active", () => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
        reportRenderIssue({ route: "/x", kind: "query-failed", detail: "test" });
        expect(takeRenderIssues()).toEqual([]);
    });

    it("records issues when a capture is active", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [];
        reportRenderIssue({ route: "/x", kind: "query-failed", detail: "boom" });
        reportRenderIssue({ route: "/y", kind: "provably-empty", detail: "{}" });

        const issues = takeRenderIssues();
        expect(issues).toHaveLength(2);
        expect(issues[0]).toEqual({ route: "/x", kind: "query-failed", detail: "boom" } satisfies RenderIssue);
        expect(issues[1]).toEqual({ route: "/y", kind: "provably-empty", detail: "{}" } satisfies RenderIssue);
    });

    it("drains and clears the buffer", () => {
        (globalThis as Record<string, unknown>)[GLOBAL_KEY] = [];
        reportRenderIssue({ route: "/x", kind: "query-failed", detail: "boom" });

        const first = takeRenderIssues();
        expect(first).toHaveLength(1);

        const second = takeRenderIssues();
        expect(second).toEqual([]);
    });
});