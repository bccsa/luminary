import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { beforeAll } from "vitest";
import { initLuminaryShared } from "luminary-shared";

config.global.stubs["RouterLink"] = RouterLinkStub;

beforeAll(() => {
    initLuminaryShared({ cms: false });
});
