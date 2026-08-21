import { describe, it, expect } from "vitest";
import fixtures from "./fixtures.spec-data.json";
import { collectDefaults, firstMessage, isAwaitingCode, oidcProviders, traitValue } from "./nodes";
import type { KratosFlow } from "./types";

// Recorded from Kratos v1.3.1 driving the real flows, so these assert against
// what Kratos actually sends rather than what it is documented to send.
const registrationStart = fixtures.registrationStart as KratosFlow;
const awaitingCode = fixtures.registrationAwaitingCode as KratosFlow;
const loginStart = fixtures.loginStart as KratosFlow;

describe("kratos nodes", () => {
    it("carries the csrf token into the submitted values", () => {
        const values = collectDefaults(registrationStart);
        expect(values.csrf_token).toBeTruthy();
    });

    it("leaves submit buttons out of the payload", () => {
        // `method` is a submit node on the start flow; sending it would pick a
        // method the user never pressed.
        expect(collectDefaults(registrationStart)).not.toHaveProperty("method");
    });

    it("keeps the traits Kratos echoes back as hidden fields", () => {
        const values = collectDefaults(awaitingCode);
        expect(values["traits.email"]).toBe("johan@example.com");
        expect(values["traits.name"]).toBe("Johan");
    });

    it("knows the code step from the flow itself", () => {
        expect(isAwaitingCode(registrationStart)).toBe(false);
        expect(isAwaitingCode(loginStart)).toBe(false);
        expect(isAwaitingCode(awaitingCode)).toBe(true);
    });

    it("reads a trait value back for re-rendering the form", () => {
        expect(traitValue(awaitingCode, "email")).toBe("johan@example.com");
        expect(traitValue(registrationStart, "email")).toBe("");
    });

    it("surfaces the error even when an info message came first", () => {
        const flow = {
            ui: {
                action: "",
                method: "POST",
                nodes: [],
                messages: [
                    { id: 1040005, text: "A code has been sent.", type: "info" as const },
                    { id: 4010008, text: "The code is invalid.", type: "error" as const },
                ],
            },
            id: "x",
        };
        expect(firstMessage(flow)?.text).toBe("The code is invalid.");
    });

    it("finds no oidc providers when none are configured", () => {
        expect(oidcProviders(loginStart)).toEqual([]);
    });
});
