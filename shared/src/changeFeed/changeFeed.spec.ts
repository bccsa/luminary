import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, afterAll, beforeAll } from "vitest";
import waitForExpect from "wait-for-expect";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { getChangeFeed, isConnected, maxUploadFileSize } from "./changeFeed";
import { db, initDatabase } from "../db/database";
import { DocType } from "../types";
import { accessMap } from "../permissions/permissions";
import { initConfig } from "../config";
import { ref } from "vue";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** Minimal SSE API: each test installs a handler for `GET /live`. */
describe("changeFeed (SSE)", () => {
    let handler: Handler = () => {};
    let requests: http.IncomingMessage[] = [];
    const openResponses = new Set<http.ServerResponse>();
    const server = http.createServer((req, res) => {
        requests.push(req);
        openResponses.add(res);
        res.on("close", () => openResponses.delete(res));
        handler(req, res);
    });

    const sse = (res: http.ServerResponse, event: string, data: unknown) => {
        if (!res.headersSent) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
            });
        }
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    function foregroundDocument() {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
    }

    beforeAll(async () => {
        // jsdom's AbortSignal is rejected by Node's native fetch; the stream is closed by the
        // test server instead, and the client's own abort bookkeeping is unaffected.
        const nodeFetch = globalThis.fetch;
        vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
            nodeFetch(input, { ...init, signal: undefined }),
        );
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            apiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            appLanguageIdsAsRef: ref([]),
        });

        await initDatabase();
        getChangeFeed().disconnect();
    });

    afterEach(async () => {
        vi.clearAllMocks();
        getChangeFeed().disconnect();
        openResponses.forEach((r) => r.destroy());
        requests = [];
        handler = () => {};

        await db.docs.clear();
        await db.localChanges.clear();
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        await new Promise((resolve) => server.close(resolve));
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("connects, declares CMS mode, and is connected once the clientConfig arrives", async () => {
        handler = (_req, res) => sse(res, "clientConfig", {});

        expect(isConnected.value).toEqual(false);
        getChangeFeed().connect();

        await waitForExpect(() => expect(isConnected.value).toEqual(true));
        expect(requests[0].url).toBe("/live?cms=1");
    });

    it("requests the union of the types the data listeners declared, and reopens when it grows", async () => {
        handler = (_req, res) => sse(res, "clientConfig", {});
        const feed = getChangeFeed();
        const a = () => {};
        const b = () => {};
        feed.on("data", a, [DocType.Post]);
        feed.connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));
        expect(requests[0].url).toBe("/live?cms=1&types=deleteCmd,post");

        feed.on("data", b, [DocType.Tag]);
        await waitForExpect(() =>
            expect(requests[1]?.url).toBe("/live?cms=1&types=deleteCmd,post,tag"),
        );
        feed.off("data", a);
        feed.off("data", b);
    });

    it("sends the credentials set with setAuth", async () => {
        handler = (_req, res) => sse(res, "clientConfig", {});

        getChangeFeed().setAuth("tok", "provider-1");
        getChangeFeed().connect();

        await waitForExpect(() => expect(requests.length).toBeGreaterThan(0));
        expect(requests[0].headers.authorization).toBe("Bearer tok");
        expect(requests[0].headers["x-auth-provider-id"]).toBe("provider-1");
        getChangeFeed().setAuth("", null);
    });

    it("can force reload the connection", async () => {
        handler = (_req, res) => sse(res, "clientConfig", {});

        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));

        getChangeFeed().reconnect();
        expect(isConnected.value).toEqual(false);
        await waitForExpect(() => {
            expect(requests.length).toEqual(2);
            expect(isConnected.value).toEqual(true);
        });
    });

    it("does not open a second stream when connect() is called while open", async () => {
        handler = (_req, res) => sse(res, "clientConfig", {});

        getChangeFeed().connect();
        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));
        expect(requests.length).toEqual(1);
    });

    it("can receive and apply a clientConfig message from the server", async () => {
        const clientConfig = {
            accessMap: { group1: { [DocType.Post]: { view: true, assign: true } } },
            maxUploadFileSize: 1234,
        };
        handler = (_req, res) => sse(res, "clientConfig", clientConfig);

        getChangeFeed().connect();

        await waitForExpect(() => {
            expect(accessMap.value).toEqual(clientConfig.accessMap);
            expect(maxUploadFileSize.value).toEqual(clientConfig.maxUploadFileSize);
        });
    });

    it("dispatches data events to listeners until they are removed", async () => {
        let live: http.ServerResponse | undefined;
        handler = (_req, res) => {
            live = res;
            sse(res, "clientConfig", {});
        };
        const cb = vi.fn();
        getChangeFeed().on("data", cb);

        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));

        sse(live!, "data", { docs: [{ _id: "a" }] });
        await waitForExpect(() => expect(cb).toHaveBeenCalledWith({ docs: [{ _id: "a" }] }));

        getChangeFeed().off("data", cb);
        sse(live!, "data", { docs: [{ _id: "b" }] });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("drops a malformed frame without reconnecting", async () => {
        let live: http.ServerResponse | undefined;
        handler = (_req, res) => {
            live = res;
            sse(res, "clientConfig", {});
        };
        const cb = vi.fn();
        getChangeFeed().on("data", cb);
        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));

        live!.write("event: data\ndata: {not json\n\n");
        sse(live!, "data", { docs: [{ _id: "ok" }] });
        await waitForExpect(() => expect(cb).toHaveBeenCalledWith({ docs: [{ _id: "ok" }] }));
        expect(requests).toHaveLength(1);
        getChangeFeed().off("data", cb);
    });

    it("keeps delivering to other listeners when one throws", async () => {
        let live: http.ServerResponse | undefined;
        handler = (_req, res) => {
            live = res;
            sse(res, "clientConfig", {});
        };
        const bad = vi.fn(() => {
            throw new Error("boom");
        });
        const good = vi.fn();
        getChangeFeed().on("data", bad);
        getChangeFeed().on("data", good);
        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));

        sse(live!, "data", { docs: [] });
        await waitForExpect(() => expect(good).toHaveBeenCalledTimes(1));
        expect(requests).toHaveLength(1);
        getChangeFeed().off("data", bad);
        getChangeFeed().off("data", good);
    });

    it("ignores heartbeat pings", async () => {
        handler = (_req, res) => {
            sse(res, "clientConfig", {});
            sse(res, "ping", "");
        };
        const cb = vi.fn();
        getChangeFeed().on("data", cb);

        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));
        expect(cb).not.toHaveBeenCalled();
        getChangeFeed().off("data", cb);
    });

    it("surfaces a 401 as a connectError carrying the reason, and stops retrying", async () => {
        handler = (_req, res) => {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "auth_failed", reason: "token_invalid" }));
        };
        const onError = vi.fn();
        getChangeFeed().on("connectError", onError);

        getChangeFeed().connect();

        await waitForExpect(() => expect(onError).toHaveBeenCalledTimes(1));
        const err = onError.mock.calls[0][0];
        expect(err.message).toBe("auth_failed");
        expect(err.data).toEqual({ type: "auth_failed", reason: "token_invalid" });
        expect(isConnected.value).toEqual(false);

        await new Promise((resolve) => setTimeout(resolve, 1300));
        expect(requests.length).toEqual(1);
        getChangeFeed().off("connectError", onError);
    });

    it("retries after the server closes the stream", async () => {
        let count = 0;
        handler = (_req, res) => {
            count += 1;
            sse(res, "clientConfig", {});
            if (count === 1) setTimeout(() => res.end(), 20);
        };

        getChangeFeed().connect();

        await waitForExpect(() => expect(count).toEqual(2), 4000);
        await waitForExpect(() => expect(isConnected.value).toEqual(true));
    });

    it("reopens the stream when no heartbeat arrives for too long", async () => {
        let live: http.ServerResponse | undefined;
        handler = (_req, res) => {
            live = res;
            sse(res, "clientConfig", {});
        };
        getChangeFeed().connect();
        await waitForExpect(() => expect(isConnected.value).toEqual(true));

        // Re-arm the idle timer under fake timers, then let it elapse
        vi.useFakeTimers({ toFake: ["setTimeout"] });
        sse(live!, "ping", "");
        // setImmediate isn't tied to socket delivery, so give the frame real time to be parsed
        const until = Date.now() + 150;
        while (Date.now() < until) await new Promise((resolve) => setImmediate(resolve));
        vi.advanceTimersByTime(60_000);
        vi.useRealTimers();

        await waitForExpect(() => expect(requests.length).toEqual(2));
    });

    it("reconnects when a disconnected tab becomes visible", async () => {
        handler = (_req, res) => sse(res, "clientConfig", {});

        getChangeFeed().disconnect();
        foregroundDocument();

        await waitForExpect(() => {
            expect(requests.length).toEqual(1);
            expect(isConnected.value).toEqual(true);
        });
    });

    it("does not start duplicate foreground reconnects while a connection is pending", async () => {
        // Never answers, so the first attempt stays pending
        handler = () => {};

        getChangeFeed().disconnect();
        foregroundDocument();
        foregroundDocument();

        await waitForExpect(() => expect(requests.length).toEqual(1));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(requests.length).toEqual(1);
    });

    // NOTE: the live-update persistence path (filter → retention gate → bulkPut) lives in the
    // sync live persister — its tests are in `api/sync/liveSync.spec.ts`.
});
