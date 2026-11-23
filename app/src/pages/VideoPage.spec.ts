import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import VideoPage from "./VideoPage.vue";
import * as auth from "@/auth";
import { accessMap, db } from "luminary-shared";
import { nextTick, ref } from "vue";
import {
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { initLanguage } from "@/globalConfig";
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { createDownloadsServiceStub, provideDownloadsStub } from "@/tests/downloadsServiceStub";

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-router");
vi.mock("@/router", () => ({
    default: {},
    getRouteHistory: () => ({ value: [] }),
    markInternalNavigation: vi.fn(),
    isExternalNavigation: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("VideoPage.vue", () => {
    beforeAll(async () => {
        accessMap.value = viewAccessToAllContentMap;
    });

    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        (auth as any).useAuth.mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        });
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await initLanguage();
    });

    afterEach(async () => {
        vitest.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    // Behavioral tests for pinned/unpinned video content (filtering, grouping, language, etc.)
    // are covered in PinnedVideo.spec.ts and UnpinnedVideo.spec.ts respectively.
    // These tests focus on page-level composition only.

    it("renders the PinnedVideo child component", async () => {
        const wrapper = mount(VideoPage);

        await waitForExpect(() => {
            expect(wrapper.findComponent(PinnedVideo).exists()).toBe(true);
        });
    });

    it("renders the UnpinnedVideo child component", async () => {
        const wrapper = mount(VideoPage);

        await waitForExpect(() => {
            expect(wrapper.findComponent(UnpinnedVideo).exists()).toBe(true);
        });
    });

    describe("downloaded filter", () => {
        const mountWith = (service?: ReturnType<typeof createDownloadsServiceStub>) =>
            mount(VideoPage, {
                global: { provide: service ? provideDownloadsStub(service) : {} },
            });
        const listsParentIds = (wrapper: ReturnType<typeof mount>) => [
            wrapper.findComponent(PinnedVideo).props("parentIds"),
            wrapper.findComponent(UnpinnedVideo).props("parentIds"),
        ];

        it("shows every video, with no switch, without the downloads service", async () => {
            const wrapper = mountWith();

            await waitForExpect(() => {
                expect(wrapper.findComponent(PinnedVideo).exists()).toBe(true);
            });
            expect(wrapper.find("[data-test='stub-watch-filter']").exists()).toBe(false);
            expect(wrapper.find("[data-test='watch-no-downloads']").exists()).toBe(false);
            expect(listsParentIds(wrapper)).toEqual([undefined, undefined]);
            expect(wrapper.html()).not.toContain("download");
        });

        it("shows every video online, with the switch on All", () => {
            const service = createDownloadsServiceStub({ playableParentIds: ["post-1"] });
            const wrapper = mountWith(service);

            const toggle = wrapper.get("[data-test='stub-watch-filter']");
            expect(toggle.attributes("data-downloaded-only")).toBe("false");
            expect(listsParentIds(wrapper)).toEqual([undefined, undefined]);
        });

        it("shows only downloaded videos by default while offline", () => {
            const service = createDownloadsServiceStub({
                playableParentIds: ["post-1", "post-2"],
                network: { online: false, metered: false },
            });
            const wrapper = mountWith(service);

            expect(
                wrapper.get("[data-test='stub-watch-filter']").attributes("data-downloaded-only"),
            ).toBe("true");
            expect(listsParentIds(wrapper)).toEqual([
                ["post-1", "post-2"],
                ["post-1", "post-2"],
            ]);
        });

        it("mounts the lists afresh on each change of mode, since they choose their query once", async () => {
            const service = createDownloadsServiceStub({ playableParentIds: ["post-1"] });
            const wrapper = mountWith(service);
            const instances = () => [
                wrapper.findComponent(PinnedVideo).vm.$.uid,
                wrapper.findComponent(UnpinnedVideo).vm.$.uid,
            ];
            const all = instances();

            await wrapper.get("[data-test='stub-watch-filter']").trigger("click");
            const downloaded = instances();
            expect(downloaded[0]).not.toBe(all[0]);
            expect(downloaded[1]).not.toBe(all[1]);

            await wrapper.get("[data-test='stub-watch-filter']").trigger("click");
            const back = instances();
            expect(back[0]).not.toBe(downloaded[0]);
            expect(back[1]).not.toBe(downloaded[1]);
            expect(listsParentIds(wrapper)).toEqual([undefined, undefined]);
        });

        it("follows the viewer's pick, and filters the same lists by the playable parents", async () => {
            const service = createDownloadsServiceStub({ playableParentIds: ["post-1"] });
            const wrapper = mountWith(service);

            await wrapper.get("[data-test='stub-watch-filter']").trigger("click");
            expect(listsParentIds(wrapper)).toEqual([["post-1"], ["post-1"]]);

            service.playableRef.value = new Set(["post-1", "post-3"]);
            await nextTick();
            expect(listsParentIds(wrapper)).toEqual([
                ["post-1", "post-3"],
                ["post-1", "post-3"],
            ]);

            await wrapper.get("[data-test='stub-watch-filter']").trigger("click");
            expect(listsParentIds(wrapper)).toEqual([undefined, undefined]);
        });

        it("goes back to downloaded videos when the device goes offline", async () => {
            const service = createDownloadsServiceStub({
                playableParentIds: ["post-1"],
                network: { online: false, metered: false },
            });
            const wrapper = mountWith(service);

            await wrapper.get("[data-test='stub-watch-filter']").trigger("click");
            expect(listsParentIds(wrapper)).toEqual([undefined, undefined]);

            service.networkRef.value = { online: true, metered: false };
            await nextTick();
            expect(listsParentIds(wrapper)).toEqual([undefined, undefined]);

            service.networkRef.value = { online: false, metered: false };
            await nextTick();
            expect(listsParentIds(wrapper)).toEqual([["post-1"], ["post-1"]]);
        });

        it("says so when nothing downloaded can play", () => {
            const service = createDownloadsServiceStub({
                network: { online: false, metered: false },
            });
            const wrapper = mountWith(service);

            expect(wrapper.get("[data-test='watch-no-downloads']").text()).toBe(
                "Videos you download will show up here.",
            );
        });
    });
});
