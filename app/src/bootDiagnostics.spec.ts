import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBootStage } from "./bootDiagnostics";
import { bootDiagnosticsScript } from "./bootSplash";

describe("development startup details", () => {
    let cleanup: (() => void) | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        delete document.documentElement.dataset.renderState;
        delete document.documentElement.dataset.bootStage;
    });

    afterEach(() => {
        cleanup?.();
        cleanup = undefined;
        vi.useRealTimers();
        delete document.documentElement.dataset.renderState;
        delete document.documentElement.dataset.bootStage;
    });

    function startDiagnostics() {
        cleanup = new Function(`return ${bootDiagnosticsScript()}`)();
    }

    it("shows the current awaited step when startup stalls", () => {
        startDiagnostics();
        setBootStage("Opening local activity storage");
        expect(document.getElementById("boot-diagnostics")).toBeNull();

        vi.advanceTimersByTime(8000);

        expect(document.getElementById("boot-diagnostics")?.textContent).toContain(
            "Step: Opening local activity storage",
        );
        expect(document.getElementById("boot-diagnostics")?.textContent).toContain(
            "Still waiting (8s)",
        );
    });

    it("shows an early module error as text even before startup has run", () => {
        startDiagnostics();
        window.dispatchEvent(
            new ErrorEvent("error", { message: "<script>module failed</script>" }),
        );

        const panel = document.getElementById("boot-diagnostics");
        expect(panel?.textContent).toContain("Loading application scripts");
        expect(panel?.textContent).toContain("Error: <script>module failed</script>");
        expect(panel?.querySelector("script")).toBeNull();
    });

    it("removes the message and stops listening after successful startup", () => {
        startDiagnostics();
        vi.advanceTimersByTime(8000);
        expect(document.getElementById("boot-diagnostics")).not.toBeNull();

        document.documentElement.dataset.renderState = "ready";
        window.dispatchEvent(new CustomEvent("render-state-change"));
        window.dispatchEvent(new ErrorEvent("error", { message: "Optional analytics blocked" }));

        expect(document.getElementById("boot-diagnostics")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
});
