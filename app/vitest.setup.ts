import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { beforeAll, vi } from "vitest";
import { initConfig, initDatabase } from "luminary-shared";

config.global.stubs["RouterLink"] = RouterLinkStub;

window.matchMedia = vi.fn().mockImplementation((query) => {
    return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    };
});

beforeAll(async () => {
    initConfig({
        cms: false,
        docsIndex:
            "type, parentId, slug, language, docType, redirect, publishDate, expiryDate, [type+parentTagType+status], [type+parentPinned], [type+status], [type+docType]",
        apiUrl: "http://localhost:12345",
    });

    await initDatabase();
});
