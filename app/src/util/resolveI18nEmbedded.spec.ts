import { describe, expect, it } from "vitest";
import { resolveI18nEmbedded } from "./resolveI18nEmbedded";

describe("resolveI18nEmbedded", () => {
    const t = (key: string) =>
        (
            {
                "login.bcc.button": "Login with BCC",
                "tenant.name": "BCC",
            } as Record<string, string>
        )[key] ?? key;

    it("returns empty string for empty input", () => {
        expect(resolveI18nEmbedded("", t)).toBe("");
        expect(resolveI18nEmbedded(undefined, t)).toBe("");
    });

    it("resolves a full dotted key", () => {
        expect(resolveI18nEmbedded("login.bcc.button", t)).toBe("Login with BCC");
    });

    it("resolves embedded keys wrapped in double brackets", () => {
        expect(resolveI18nEmbedded("Sign in with [[tenant.name]]", t)).toBe("Sign in with BCC");
    });

    it("leaves plain text unchanged", () => {
        expect(resolveI18nEmbedded("Sign in", t)).toBe("Sign in");
    });
});
