import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { mockEnglishContentDto } from "@/tests/mockdata";
import MediaPlayerUpNext from "../MediaPlayerUpNext.vue";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import { downloadsServiceStub } from "./downloadsStub";

vi.mock("@/composables/useContentQuery", async () => {
    const { ref } = await import("vue");
    return { useContentQuery: () => ref([]) };
});

const series = [
    { ...mockEnglishContentDto, _id: "a", parentId: "post-a" },
    { ...mockEnglishContentDto, _id: "b", parentId: "post-b" },
];

/** The service's badge, as it draws itself: here it only names whose it is. */
const BadgeStub = defineComponent({
    props: { parentId: String },
    setup: (props) => () => h("span", { "data-test": "badge", "data-parent": props.parentId }),
});

function mountUpNext(provide: Record<symbol, unknown> = {}) {
    return mount(MediaPlayerUpNext, {
        props: { series: series as any, related: [], currentId: "post-a" },
        global: { stubs: { LImage: true }, provide },
    });
}

describe("MediaPlayerUpNext", () => {
    it("carries each item's download badge where there are downloads", () => {
        const service = downloadsServiceStub();
        service.ui.DownloadBadge = BadgeStub;
        const wrapper = mountUpNext({ [DownloadsKey as symbol]: service });
        expect(
            wrapper.findAll("[data-test='badge']").map((b) => b.attributes("data-parent")),
        ).toEqual(["post-a", "post-b"]);
    });

    it("shows no badge without downloads", () => {
        const wrapper = mountUpNext();
        expect(wrapper.findAll("[data-test='mediaPlayerUpNextItem']")).toHaveLength(2);
        expect(wrapper.find("[data-test='badge']").exists()).toBe(false);
    });
});
