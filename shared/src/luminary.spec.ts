import { describe, it, expect, vi } from "vitest";

const mockInitConfig = vi.fn();
const mockInitDatabase = vi.fn().mockResolvedValue(undefined);
const mockGetSocket = vi.fn();
const mockGetRest = vi.fn();
const mockInitSync = vi.fn();
const mockInitLiveSync = vi.fn();
const mockInitRoomSubscriptions = vi.fn();
const mockWarmWorkers = vi.fn();
const mockRunInWorker = vi.fn();
const mockSetCorpusScanner = vi.fn();

vi.mock("./config", () => ({
    initConfig: (...args: any[]) => mockInitConfig(...args),
}));

vi.mock("./db/database", () => ({
    initDatabase: () => mockInitDatabase(),
}));

vi.mock("./api/RestApi", () => ({
    getRest: () => mockGetRest(),
}));

vi.mock("./api/http", () => ({
    HttpReq: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("./api/sync/sync", () => ({
    initSync: (...args: any[]) => mockInitSync(...args),
}));

vi.mock("./api/sync/liveSync", () => ({
    initLiveSync: () => mockInitLiveSync(),
}));

vi.mock("./socket/socketio", () => ({
    getSocket: () => mockGetSocket(),
}));

vi.mock("./socket/roomSubscriptions", () => ({
    initRoomSubscriptions: () => mockInitRoomSubscriptions(),
}));

vi.mock("./worker/workerClient", () => ({
    warmWorkers: () => mockWarmWorkers(),
    runInWorker: (...args: any[]) => mockRunInWorker(...args),
}));

vi.mock("./fts/ftsIndexer", () => ({
    setCorpusScanner: (...args: any[]) => mockSetCorpusScanner(...args),
}));

import { init } from "./luminary";
import type { SharedConfig } from "./config";

describe("init", () => {
    it("initializes all subsystems in order", async () => {
        const config: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
        };

        await init(config);

        expect(mockInitConfig).toHaveBeenCalledWith(config);
        expect(mockInitDatabase).toHaveBeenCalled();
        expect(mockGetSocket).toHaveBeenCalled();
        expect(mockGetRest).toHaveBeenCalled();
        expect(mockInitSync).toHaveBeenCalled();
    });

    it("awaits initDatabase before continuing", async () => {
        const order: string[] = [];
        mockInitDatabase.mockImplementation(async () => {
            order.push("db");
        });
        mockGetSocket.mockImplementation(() => {
            order.push("socket");
        });
        mockGetRest.mockImplementation(() => {
            order.push("rest");
        });

        const config: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
        };

        await init(config);

        expect(order.indexOf("db")).toBeLessThan(order.indexOf("socket"));
        expect(order.indexOf("db")).toBeLessThan(order.indexOf("rest"));
    });

    it("warms the worker pool only after the database is open", async () => {
        const order: string[] = [];
        mockInitDatabase.mockImplementation(async () => {
            order.push("db");
        });
        mockWarmWorkers.mockImplementation(() => {
            order.push("workers");
        });

        await init({ cms: false, docsIndex: "type", apiUrl: "https://api.example.com" });

        expect(order.indexOf("db")).toBeLessThan(order.indexOf("workers"));
    });

    it("routes the corpus scan through the worker", async () => {
        mockSetCorpusScanner.mockClear();
        mockRunInWorker.mockClear();

        await init({ cms: false, docsIndex: "type", apiUrl: "https://api.example.com" });

        const [scanner] = mockSetCorpusScanner.mock.calls[0];
        scanner();
        expect(mockRunInWorker).toHaveBeenCalledWith("corpusScan", undefined);
    });

    it("skips the worker pool when useWorkers is false", async () => {
        mockWarmWorkers.mockClear();

        await init({
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            useWorkers: false,
        });

        expect(mockWarmWorkers).not.toHaveBeenCalled();
    });
});
