import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn().mockResolvedValue({ docs: [] });
const mockPost = vi.fn().mockResolvedValue({ ok: true });
const mockGetWithQueryParams = vi.fn().mockResolvedValue({ status: "connected" });

vi.mock("./http", () => ({
    HttpReq: vi.fn().mockImplementation(() => ({
        get: mockGet,
        post: mockPost,
        getWithQueryParams: mockGetWithQueryParams,
    })),
}));

vi.mock("../util", () => ({
    useDexieLiveQuery: vi.fn().mockReturnValue({ value: [] }),
}));

vi.mock("./syncLocalChanges", () => ({
    syncLocalChanges: vi.fn(),
}));

vi.mock("../db/database", () => ({
    db: {
        localChanges: { toArray: vi.fn().mockResolvedValue([]) },
    },
}));

vi.mock("./sync", () => ({
    syncActive: { value: false },
}));

// We need to control the config module. Use a mutable object.
let mockConfig: any = null;

vi.mock("../config", async () => {
    return {
        get config() {
            return mockConfig;
        },
    };
});

import { getRest } from "./RestApi";

describe("RestApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockConfig = null;
    });

    function setValidConfig() {
        mockConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [{ type: "post", sync: true }],
        };
    }

    it("throws without config", () => {
        mockConfig = null;
        expect(() => getRest({ reset: true })).toThrow("options object");
    });

    it("throws without apiUrl", () => {
        mockConfig = { apiUrl: "", syncList: [{ type: "post" }] };
        expect(() => getRest({ reset: true })).toThrow("API URL");
    });

    it("throws without syncList", () => {
        mockConfig = { apiUrl: "https://api.example.com", syncList: [] };
        expect(() => getRest({ reset: true })).toThrow("DocTypes");
    });

    it("returns a singleton instance", () => {
        setValidConfig();
        const rest1 = getRest({ reset: true });
        const rest2 = getRest();
        expect(rest1).toBe(rest2);
    });

    it("creates new instance with reset: true", () => {
        setValidConfig();
        const rest1 = getRest({ reset: true });
        const rest2 = getRest({ reset: true });
        expect(rest1).not.toBe(rest2);
    });

    it("search delegates to http.get with apiVersion", async () => {
        setValidConfig();
        const rest = getRest({ reset: true });
        await rest.search({ limit: 10 });
        expect(mockGet).toHaveBeenCalledWith("search", expect.objectContaining({ apiVersion: "0.0.0" }));
    });

    it("changeRequest delegates to http.post", async () => {
        setValidConfig();
        const rest = getRest({ reset: true });
        await rest.changeRequest({ id: 1, doc: {} });
        expect(mockPost).toHaveBeenCalledWith("changerequest", expect.objectContaining({ apiVersion: "0.0.0" }));
    });

    it("getStorageStatus delegates to http.getWithQueryParams", async () => {
        setValidConfig();
        const rest = getRest({ reset: true });
        await rest.getStorageStatus("bucket-1");
        expect(mockGetWithQueryParams).toHaveBeenCalledWith("storage/storagestatus", {
            bucketId: "bucket-1",
            apiVersion: "0.0.0",
        });
    });
});
