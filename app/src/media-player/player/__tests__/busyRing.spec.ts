import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(`${process.cwd()}/src/media-player/player/styles.css`, "utf8");

/** Every rule that sets `--lmpl-s`, as its list of selectors. */
function scaleRules(): string[][] {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /--lmpl-s\s*:/.test(body))
        .map(([, selectors]) =>
            selectors
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
        );
}

describe("the loading ring", () => {
    it("is sized by the controls' scale, which is otherwise undefined where it sits", () => {
        expect(css).toMatch(/\.lmpl-busy svg\s*{[^}]*width:\s*calc\(56px \* var\(--lmpl-s\)\)/);

        const controlScales = scaleRules().filter((selectors) =>
            selectors.includes(".lmpl-root .lmpl-controls-content"),
        );
        // The base scale and each larger-screen step.
        expect(controlScales.length).toBeGreaterThanOrEqual(3);
        for (const selectors of controlScales) {
            expect(selectors).toContain(".lmpl-root .lmpl-busy");
        }
    });
});
