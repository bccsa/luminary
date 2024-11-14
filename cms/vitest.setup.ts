import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { initLuminaryShared } from "luminary-shared";
import { beforeAll } from "vitest";

config.global.stubs["RouterLink"] = RouterLinkStub;

beforeAll(async () => {
    await initLuminaryShared(
        { cms: true },
        "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
    );
});
