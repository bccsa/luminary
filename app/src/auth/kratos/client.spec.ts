import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixtures from "./fixtures.spec-data.json";
import { submitFlow } from "./client";
import type { KratosFlow } from "./types";

const flow = fixtures.registrationStart as KratosFlow;

function respond(status: number, body: unknown, ok = status < 400) {
    return { ok, status, json: async () => body } as Response;
}

describe("submitFlow", () => {
    beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
    afterEach(() => vi.unstubAllGlobals());

    it("merges the caller's values over the ones Kratos sent", async () => {
        vi.mocked(fetch).mockResolvedValue(respond(200, { session: { id: "s1" } }));
        await submitFlow(flow, { method: "code", "traits.email": "a@b.com" });

        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
        expect(body.csrf_token).toBeTruthy();
        expect(body.method).toBe("code");
        expect(body["traits.email"]).toBe("a@b.com");
    });

    it("treats a 400 as the next step, not a failure", async () => {
        const next = fixtures.registrationAwaitingCode;
        vi.mocked(fetch).mockResolvedValue(respond(400, next));

        const result = await submitFlow(flow, {});
        expect(result.kind).toBe("flow");
    });

    it("reports an expired flow rather than a generic error", async () => {
        vi.mocked(fetch).mockResolvedValue(respond(410, {}));
        expect((await submitFlow(flow, {})).kind).toBe("expired");
    });

    it("follows a browser redirect Kratos asks for", async () => {
        vi.mocked(fetch).mockResolvedValue(
            respond(422, { redirect_browser_to: "https://idp.example/authorize" }),
        );
        expect(await submitFlow(flow, {})).toEqual({
            kind: "redirect",
            to: "https://idp.example/authorize",
        });
    });

    it("returns the session on success", async () => {
        vi.mocked(fetch).mockResolvedValue(respond(200, { session: { id: "s1", active: true } }));
        const result = await submitFlow(flow, {});
        expect(result).toMatchObject({ kind: "session", session: { id: "s1" } });
    });

    it("sends the browser to verification when registration still owes one", async () => {
        vi.mocked(fetch).mockResolvedValue(
            respond(200, {
                continue_with: [{ action: "show_verification_ui", flow: { id: "v1" } }],
            }),
        );
        expect(await submitFlow(flow, {})).toEqual({
            kind: "redirect",
            to: "/auth/verify?flow=v1",
        });
    });

    it("calls a dropped connection offline instead of throwing", async () => {
        vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
        expect((await submitFlow(flow, {})).kind).toBe("offline");
    });
});
