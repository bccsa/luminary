import { describe, expect, it } from "vitest";
import { resolveI18nEmbedded } from "./resolveI18nEmbedded";

describe("resolveI18nEmbedded", () => {
    const t = (key: string) =>
        (
            {
                "login.provider.button": "Sign in with Example Org",
                "organization.name": "Example Org",
            } as Record<string, string>
        )[key] ?? key;

    it("returns empty string for empty input", () => {
        expect(resolveI18nEmbedded("", t)).toBe("");
        expect(resolveI18nEmbedded(undefined, t)).toBe("");
    });

    it("resolves a full dotted key", () => {
        expect(resolveI18nEmbedded("login.provider.button", t)).toBe("Sign in with Example Org");
    });

    it("resolves embedded keys wrapped in double brackets", () => {
        expect(resolveI18nEmbedded("Sign in with [[organization.name]]", t)).toBe(
            "Sign in with Example Org",
        );
    });

    it("leaves plain text unchanged", () => {
        expect(resolveI18nEmbedded("Sign in", t)).toBe("Sign in");
    });
});
