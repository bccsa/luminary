import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import VerticalImagePreview from "./VerticalImagePreview.vue";
import { renderVertical } from "@/util/verticalImage/renderVertical";

vi.mock("@/util/verticalImage/renderVertical", () => ({
    renderVertical: vi.fn(),
}));

const fileCollections = [
    {
        aspectRatio: 0.75,
        imageFiles: [{ width: 640, height: 853, filename: "portrait-640.webp" }],
    },
    {
        aspectRatio: 1.78,
        imageFiles: [
            { width: 640, height: 360, filename: "landscape-640.webp" },
            { width: 2560, height: 1440, filename: "landscape-2560.webp" },
        ],
    },
];

describe("VerticalImagePreview", () => {
    beforeEach(() => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });
        URL.createObjectURL = vi.fn(() => "blob:vertical");
        URL.revokeObjectURL = vi.fn();
        vi.mocked(renderVertical).mockResolvedValue({
            blob: new Blob(),
            plan: {
                strategy: "blur-fill",
                width: 1080,
                height: 1440,
                cropBox: { left: 0, top: 0, width: 2560, height: 1440 },
                placement: { left: 0, top: 416, width: 1080, height: 608 },
                subject: { start: 0, end: 2560 },
            },
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    it("renders nothing without a bucket URL", () => {
        const wrapper = mount(VerticalImagePreview, { props: { fileCollections } });
        expect(wrapper.find('[data-test="vertical-preview-open"]').exists()).toBe(false);
    });

    it("renders the widest file of the landscape collection and shows the result", async () => {
        const wrapper = mount(VerticalImagePreview, {
            props: { fileCollections, bucketUrl: "https://bucket.test/" },
            attachTo: document.body,
        });

        await wrapper.find('[data-test="vertical-preview-open"]').trigger("click");
        await flushPromises();

        expect(global.fetch).toHaveBeenCalledWith("https://bucket.test/landscape-2560.webp", {
            mode: "cors",
        });
        expect(renderVertical).toHaveBeenCalledWith(expect.any(Blob), { strategy: "auto" });
        expect(document.body.querySelector('[data-test="vertical-preview-result"]')).not.toBeNull();
        expect(document.body.textContent).toContain("Blur fill");
    });

    it("explains a CORS failure", async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
        const wrapper = mount(VerticalImagePreview, {
            props: { fileCollections, bucketUrl: "https://bucket.test" },
            attachTo: document.body,
        });

        await wrapper.find('[data-test="vertical-preview-open"]').trigger("click");
        await flushPromises();

        expect(document.body.textContent).toContain("allows CORS");
    });
});
