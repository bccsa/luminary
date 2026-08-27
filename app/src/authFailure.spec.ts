import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSocket } = vi.hoisted(() => ({
    mockSocket: {
        on: vi.fn(),
        connect: vi.fn(),
        setAuth: vi.fn(),
        reconnect: vi.fn(),
    },
}));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return new Proxy(actual, {
        get(target, prop) {
            if (prop === "getSocket") return () => mockSocket;
            return Reflect.get(target, prop);
        },
    });
});

vi.mock("@/auth", () => ({
    clearAuthCache: vi.fn(),
    loginWithProvider: vi.fn(),
    openProviderModal: vi.fn(),
    refreshTokenWithOutcome: vi.fn(),
    resolveActiveProvider: vi.fn(),
}));

vi.mock("@/util/initSentry", () => ({ Sentry: { captureMessage: vi.fn() } }));

import { handleConnectError, registerAuthFailureHandler } from "./authFailure";
import {
    clearAuthCache,
    loginWithProvider,
    openProviderModal,
    refreshTokenWithOutcome,
    resolveActiveProvider,
} from "@/auth";

const authFailed = (reason?: string) =>
    Object.assign(new Error("auth_failed"), { data: { type: "auth_failed", reason } });

describe("authFailure", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        // Clears any backoff timer left pending by the previous test.
        registerAuthFailureHandler();
        vi.mocked(resolveActiveProvider).mockResolvedValue(null);
        vi.mocked(refreshTokenWithOutcome).mockResolvedValue("rejected");
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("registers before anything can connect, so the first failure isn't missed", () => {
        registerAuthFailureHandler();

        expect(mockSocket.on).toHaveBeenCalledWith("connect_error", handleConnectError);
    });

    it("ignores connection errors that aren't authentication failures", async () => {
        await handleConnectError(new Error("xhr poll error"));

        expect(clearAuthCache).not.toHaveBeenCalled();
        expect(refreshTokenWithOutcome).not.toHaveBeenCalled();
    });

    it("recognises a bare auth_failed error that carries no data payload", async () => {
        await handleConnectError(new Error("auth_failed"));

        expect(refreshTokenWithOutcome).toHaveBeenCalledWith({
            ignoreCache: true,
            requireJwt: true,
        });
    });

    describe("provider_not_found", () => {
        it("reconnects anonymously so the provider list can reach the modal", async () => {
            await handleConnectError(authFailed("provider_not_found"));

            expect(openProviderModal).toHaveBeenCalled();
            // Auto-reconnection is off after an auth failure. Without this the
            // socket stays down, no AuthProvider docs ever sync, and the modal
            // that just opened is permanently empty.
            expect(mockSocket.connect).toHaveBeenCalled();
        });

        it("drops the rejected credentials before reconnecting", async () => {
            await handleConnectError(authFailed("provider_not_found"));

            expect(clearAuthCache).toHaveBeenCalled();
            expect(vi.mocked(clearAuthCache).mock.invocationCallOrder[0]).toBeLessThan(
                vi.mocked(mockSocket.connect).mock.invocationCallOrder[0],
            );
        });

        it("does not attempt a silent refresh against the missing provider", async () => {
            await handleConnectError(authFailed("provider_not_found"));

            // Retrying with the cached provider is what loops.
            expect(refreshTokenWithOutcome).not.toHaveBeenCalled();
            expect(loginWithProvider).not.toHaveBeenCalled();
        });
    });

    describe("expired token", () => {
        it("recovers silently, leaving the session intact", async () => {
            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("refreshed");

            await handleConnectError(authFailed("token_invalid"));

            expect(refreshTokenWithOutcome).toHaveBeenCalledWith({
                ignoreCache: true,
                requireJwt: true,
            });
            expect(clearAuthCache).not.toHaveBeenCalled();
            expect(openProviderModal).not.toHaveBeenCalled();
        });

        it("re-logs in against the last provider when the refresh token is gone", async () => {
            const provider = { _id: "p1", domain: "d", clientId: "c", audience: "a" };
            vi.mocked(resolveActiveProvider).mockResolvedValue(provider);

            await handleConnectError(authFailed("token_invalid"));

            expect(loginWithProvider).toHaveBeenCalledWith(provider, { prompt: "login" });
            // Read before the cache is cleared, or there is no provider left to name.
            expect(vi.mocked(resolveActiveProvider).mock.invocationCallOrder[0]).toBeLessThan(
                vi.mocked(clearAuthCache).mock.invocationCallOrder[0],
            );
        });

        it("falls back to provider selection when no provider is known", async () => {
            await handleConnectError(authFailed("token_invalid"));

            expect(loginWithProvider).not.toHaveBeenCalled();
            expect(openProviderModal).toHaveBeenCalled();
            // Auto-reconnection is off after an auth failure, so without this the
            // modal has no AuthProvider docs to list.
            expect(mockSocket.connect).toHaveBeenCalled();
        });
    });

    describe("provider unreachable", () => {
        // The distinction this whole path exists for: a refresh that never got an
        // answer says nothing about whether the credentials are still valid.
        it("keeps the session and retries rather than signing the user out", async () => {
            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("unavailable");

            await handleConnectError(authFailed("token_invalid"));

            expect(clearAuthCache).not.toHaveBeenCalled();
            expect(loginWithProvider).not.toHaveBeenCalled();
            expect(openProviderModal).not.toHaveBeenCalled();
        });

        it("backs off between retries and stops once the refresh succeeds", async () => {
            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("unavailable");

            await handleConnectError(authFailed("token_invalid"));
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(1);

            // Nothing fires early.
            await vi.advanceTimersByTimeAsync(1_999);
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1);
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(2);

            // Second delay is longer than the first.
            await vi.advanceTimersByTimeAsync(4_999);
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(2);

            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("refreshed");
            await vi.advanceTimersByTimeAsync(1);
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(3);

            // Recovered, so the loop stops.
            await vi.advanceTimersByTimeAsync(120_000);
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(3);
            expect(clearAuthCache).not.toHaveBeenCalled();
        });

        it("signs the user out once the provider actually refuses", async () => {
            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("unavailable");
            await handleConnectError(authFailed("token_invalid"));

            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("rejected");
            await vi.advanceTimersByTimeAsync(2_000);

            expect(clearAuthCache).toHaveBeenCalled();
        });

        it("retries immediately when the browser comes back online", async () => {
            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("unavailable");
            await handleConnectError(authFailed("token_invalid"));
            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(1);

            window.dispatchEvent(new Event("online"));
            await vi.advanceTimersByTimeAsync(0);

            expect(refreshTokenWithOutcome).toHaveBeenCalledTimes(2);
        });
    });

    describe("superseded", () => {
        it("does nothing when a logout or provider switch overtook the refresh", async () => {
            vi.mocked(refreshTokenWithOutcome).mockResolvedValue("superseded");

            await handleConnectError(authFailed("token_invalid"));

            expect(clearAuthCache).not.toHaveBeenCalled();
            expect(loginWithProvider).not.toHaveBeenCalled();
        });
    });
});
