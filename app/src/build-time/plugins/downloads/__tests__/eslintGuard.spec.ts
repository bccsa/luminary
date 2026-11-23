import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type LintMessage = { ruleId: string | null; message: string };
type Linter = {
    lintText(code: string, options: { filePath: string }): Promise<{ messages: LintMessage[] }[]>;
};
// Vitest runs from the app's root, whose config this probes.
const appRoot = process.cwd();
const { ESLint } = createRequire(join(appRoot, "package.json"))("eslint") as {
    ESLint: new (options: { cwd: string }) => Linter;
};
const eslint = new ESLint({ cwd: appRoot });

/** The in-app entry's restricted-syntax errors for `body` placed inside a function. */
async function guardErrors(body: string): Promise<string[]> {
    const code = `export function installDownloads(): void {\n${body}\n}\n`;
    const [result] = await eslint.lintText(code, {
        filePath: join(appRoot, "src/build-time/plugins/downloads/index.ts"),
    });
    return result.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
}

describe("the in-app downloads entry's import guard", () => {
    it("accepts the provide import in the consequent of a DEV && … test", async () => {
        expect(
            await guardErrors('if (import.meta.env.DEV && f()) { void import("./provide"); }'),
        ).toEqual([]);
        expect(
            await guardErrors('if (import.meta.env.DEV && f()) void import("./provide");'),
        ).toEqual([]);
    });

    it("rejects a test that lets a build through: DEV || …", async () => {
        expect(
            await guardErrors('if (import.meta.env.DEV || f()) { void import("./provide"); }'),
        ).toHaveLength(1);
    });

    it("rejects the import in the else branch", async () => {
        expect(
            await guardErrors(
                'if (import.meta.env.DEV && f()) { f(); } else { void import("./provide"); }',
            ),
        ).toHaveLength(1);
    });

    it("rejects the import inside the test, a bare DEV test and any other module", async () => {
        expect(
            await guardErrors('if (import.meta.env.DEV && import("./provide")) { f(); }'),
        ).toHaveLength(1);
        expect(
            await guardErrors('if (import.meta.env.DEV) { void import("./provide"); }'),
        ).toHaveLength(1);
        expect(
            await guardErrors('if (import.meta.env.DEV && f()) { void import("./other"); }'),
        ).toHaveLength(1);
        expect(await guardErrors('void import("./provide");')).toHaveLength(1);
    });
});
