import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/RestApi", () => ({
    getRest: vi.fn(),
}));

import { ftsSearchApi, shouldUseApiFts } from "./ftsSearchApi";
import { getRest } from "../api/RestApi";
import { initConfig } from "../config";
import { isConnected } from "../socket/socketio";
import type { ApiFtsResult } from "./types";

const ftsMock = vi.fn();

describe("ftsSearchApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getRest).mockReturnValue({ fts: ftsMock } as any);
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://x" } as any);
    });

    it("maps options to the API query (queryString, languages, cms)", async () => {
        ftsMock.mockResolvedValue([]);
        await ftsSearchApi({
            query: "garden",
            languageId: "lang-eng",
            limit: 40,
            offset: 20,
            maxTrigramDocPercent: 60,
        });
        expect(ftsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queryString: "garden",
                languages: ["lang-eng"],
                limit: 40,
                offset: 20,
                cms: false,
                maxTrigramDocPercent: 60,
            }),
        );
    });

    it("forwards the type / tag / status / publishDate / expiryDate filters to the API query", async () => {
        ftsMock.mockResolvedValue([]);
        await ftsSearchApi({
            query: "garden",
            types: ["post" as any],
            tags: ["tag-1", "tag-2"],
            status: "published" as any,
            publishedAfter: 100,
            publishedBefore: 200,
            expiresAfter: 300,
            expiresBefore: 400,
        });
        expect(ftsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                types: ["post"],
                tags: ["tag-1", "tag-2"],
                status: "published",
                publishedAfter: 100,
                publishedBefore: 200,
                expiresAfter: 300,
                expiresBefore: 400,
            }),
        );
    });

    it("forwards strict-mode matchAllWords + sort to the API query", async () => {
        ftsMock.mockResolvedValue([]);
        await ftsSearchApi({
            query: "garden",
            matchAllWords: true,
            sort: { field: "updatedTimeUtc", direction: "desc" },
        });
        expect(ftsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                matchAllWords: true,
                sort: { field: "updatedTimeUtc", direction: "desc" },
            }),
        );
    });

    it("omits languages when no languageId is given", async () => {
        ftsMock.mockResolvedValue([]);
        await ftsSearchApi({ query: "garden" });
        expect(ftsMock.mock.calls[0][0].languages).toBeUndefined();
    });

    it("passes through config.cms", async () => {
        initConfig({ cms: true, docsIndex: "", apiUrl: "http://x" } as any);
        ftsMock.mockResolvedValue([]);
        await ftsSearchApi({ query: "garden" });
        expect(ftsMock.mock.calls[0][0].cms).toBe(true);
    });

    it("normalizes results and tags them source: 'api'", async () => {
        const apiResults: ApiFtsResult[] = [
            {
                docId: "d1",
                score: 5,
                wordMatchScore: 2,
                doc: { _id: "d1", title: "garden" } as any,
            },
        ];
        ftsMock.mockResolvedValue(apiResults);
        const res = await ftsSearchApi({ query: "garden" });
        expect(res).toEqual([
            {
                docId: "d1",
                score: 5,
                wordMatchScore: 2,
                doc: { _id: "d1", title: "garden" },
                source: "api",
            },
        ]);
    });

    it("throws when the API request fails (undefined response)", async () => {
        ftsMock.mockResolvedValue(undefined);
        await expect(ftsSearchApi({ query: "garden" })).rejects.toThrow("FTS API request failed");
    });
});

describe("shouldUseApiFts", () => {
    beforeEach(() => {
        isConnected.value = true;
    });

    it("searches locally under a full content sync (no cutoff)", () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://x" });
        expect(shouldUseApiFts()).toBe(false);
    });

    it("searches the server when content sync is disabled, even without a cutoff", () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://x", contentSync: false });
        expect(shouldUseApiFts()).toBe(true);
    });

    it("searches locally while offline even when content sync is disabled", () => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://x", contentSync: false });
        isConnected.value = false;
        expect(shouldUseApiFts()).toBe(false);
    });
});
