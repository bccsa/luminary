import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initConfig } from "./config";
import type { DiagnosticsReporter } from "./diagnostics";
import { reportBreadcrumb, reportError } from "./diagnostics";

const baseConfig = { cms: false, docsIndex: "type", apiUrl: "https://api.example.com" };

describe("diagnostics", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it("logs to the console when no reporter is configured", () => {
        initConfig(baseConfig);
        const err = new Error("boom");

        reportError(err, { area: "HybridQuery", op: "local-read" });

        expect(consoleError).toHaveBeenCalledWith("[HybridQuery] local-read failed:", err);
    });

    it("hands the error and its context to the configured reporter", () => {
        const reporter: DiagnosticsReporter = { captureError: vi.fn(), breadcrumb: vi.fn() };
        initConfig({ ...baseConfig, diagnostics: reporter });
        const err = new Error("boom");
        const ctx = { area: "retention", op: "flush", data: { entries: 3 } };

        reportError(err, ctx);
        reportBreadcrumb("Sync started: content", { area: "sync", op: "run" });

        expect(reporter.captureError).toHaveBeenCalledWith(err, ctx);
        expect(consoleError).toHaveBeenCalledWith("[retention] flush failed:", err, ctx.data);
        expect(reporter.breadcrumb).toHaveBeenCalledWith("Sync started: content", {
            area: "sync",
            op: "run",
        });
    });

    it("never lets a throwing reporter break the calling flow", () => {
        initConfig({
            ...baseConfig,
            diagnostics: {
                captureError: () => {
                    throw new Error("reporter down");
                },
                breadcrumb: () => {
                    throw new Error("reporter down");
                },
            },
        });

        expect(() => reportError(new Error("boom"), { area: "a", op: "b" })).not.toThrow();
        expect(() => reportBreadcrumb("step", { area: "a", op: "b" })).not.toThrow();
    });
});
