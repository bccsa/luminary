import { describe, it, expect } from "vitest";
import { initConfig, config, getContentPublishDateCutoff } from "./config";
import type { SharedConfig } from "./config";
import { OPEN_MIN } from "./rest/sync2/utils";

describe("initConfig", () => {
    it("sets the config object", () => {
        const cfg: SharedConfig = {
            cms: true,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
        };
        initConfig(cfg);
        expect(config).toBe(cfg);
        expect(config.cms).toBe(true);
        expect(config.apiUrl).toBe("https://api.example.com");
    });

    it("sets contentOnly to false by default on syncList entries", () => {
        const cfg: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [{ type: "post" as any }],
        };
        initConfig(cfg);
        expect(config.syncList![0].contentOnly).toBe(false);
    });

    it("sets sync to true by default when undefined", () => {
        const cfg: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [{ type: "post" as any }],
        };
        initConfig(cfg);
        expect(config.syncList![0].sync).toBe(true);
    });

    it("does not overwrite explicit contentOnly: true", () => {
        const cfg: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [{ type: "post" as any, contentOnly: true }],
        };
        initConfig(cfg);
        expect(config.syncList![0].contentOnly).toBe(true);
    });

    it("does not overwrite explicit sync: false", () => {
        const cfg: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [{ type: "post" as any, sync: false }],
        };
        initConfig(cfg);
        expect(config.syncList![0].sync).toBe(false);
    });

    it("handles undefined syncList gracefully", () => {
        const cfg: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
        };
        initConfig(cfg);
        expect(config.syncList).toBeUndefined();
    });

    it("handles empty syncList array", () => {
        const cfg: SharedConfig = {
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            syncList: [],
        };
        initConfig(cfg);
        expect(config.syncList).toEqual([]);
    });
});

describe("getContentPublishDateCutoff", () => {
    it("returns the configured value verbatim", () => {
        initConfig({
            cms: false,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            contentPublishDateCutoff: 42_000_000,
        });
        expect(getContentPublishDateCutoff()).toBe(42_000_000);
    });

    it("falls back to OPEN_MIN when the field is omitted (no cutoff = full sync)", () => {
        initConfig({
            cms: true,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
        });
        expect(getContentPublishDateCutoff()).toBe(OPEN_MIN);
    });

    it("falls back to OPEN_MIN when explicitly set to undefined", () => {
        initConfig({
            cms: true,
            docsIndex: "type",
            apiUrl: "https://api.example.com",
            contentPublishDateCutoff: undefined,
        });
        expect(getContentPublishDateCutoff()).toBe(OPEN_MIN);
    });
});
