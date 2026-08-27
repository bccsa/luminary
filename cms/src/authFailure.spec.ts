import { beforeEach, describe, expect, it, vi } from "vitest";

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
    refreshTokenSilently: vi.fn(),
    resolveActiveProvider: vi.fn(),
}));

vi.mock("@sentry/vue", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { handleConnectError, registerAuthFailureHandler } from "./authFailure";
import {
    clearAuthCache,
    loginWithProvider,
    openProviderModal,
    refreshTokenSilently,
    resolveActiveProvider,
} from "@/auth";

const authFailed = (reason?: string) =>
    Object.assign(new Error("auth_failed"), { data: { type: "auth_failed", reason } });

describe("authFailure", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(resolveActiveProvider).mockResolvedValue(null);
        vi.mocked(refreshTokenSilently).mockResolvedValue(false);
    });

    it("registers before anything can connect, so the first failure isn't missed", () => {
        registerAuthFailureHandler();

        expect(mockSocket.on).toHaveBeenCalledWith("connect_error", handleConnectError);
    });

    it("ignores connection errors that aren't authentication failures", async () => {
        await handleConnectError(new Error("xhr poll error"));

        expect(clearAuthCache).not.toHaveBeenCalled();
        expect(refreshTokenSilently).not.toHaveBeenCalled();
    });

    it("recognises a bare auth_failed error that carries no data payload", async () => {
        await handleConnectError(new Error("auth_failed"));

        expect(refreshTokenSilently).toHaveBeenCalledWith({
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
            expect(refreshTokenSilently).not.toHaveBeenCalled();
            expect(loginWithProvider).not.toHaveBeenCalled();
        });
    });

    describe("expired token", () => {
        it("recovers silently, leaving the session intact", async () => {
            vi.mocked(refreshTokenSilently).mockResolvedValue(true);

            await handleConnectError(authFailed("token_invalid"));

            expect(refreshTokenSilently).toHaveBeenCalledWith({
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
});
