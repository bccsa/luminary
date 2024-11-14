import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { beforeAll } from "vitest";
import { initLuminaryShared } from "luminary-shared";

config.global.stubs["RouterLink"] = RouterLinkStub;

beforeAll(async () => {
    await initLuminaryShared({
        cms: false,
        docsIndex:
            "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
    });
});
