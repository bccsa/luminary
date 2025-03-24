import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { initDatabase, initConfig } from "luminary-shared";
import { beforeAll } from "vitest";

config.global.stubs["RouterLink"] = RouterLinkStub;

beforeAll(async () => {
    initConfig({
        cms: true,
        docsIndex:
            "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned, [type+parentType+language]",
        apiUrl: "http://localhost:12345",
    });

    await initDatabase();
});
