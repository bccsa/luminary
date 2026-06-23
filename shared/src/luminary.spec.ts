import { describe, it, expect, vi } from "vitest";

const mockInitConfig = vi.fn();
const mockInitDatabase = vi.fn().mockResolvedValue(undefined);
const mockGetSocket = vi.fn();
const mockGetRest = vi.fn();
const mockInitSync = vi.fn();
const mockInitLiveSync = vi.fn();
const mockInitRoomSubscriptions = vi.fn();

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

import { init } from "./luminary";
import type { SharedConfig } from "./config";

describe("init", () => {
    it("initializes all subsystems in order", async () => {
        const config: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [{ type: "post" as any }],
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
});
