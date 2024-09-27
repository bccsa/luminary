import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { initLuminaryShared } from "luminary-shared";
import { beforeAll } from "vitest";

config.global.stubs["RouterLink"] = RouterLinkStub;

beforeAll(() => {
    initLuminaryShared({ cms: true });
});
