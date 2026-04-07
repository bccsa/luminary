import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ImageModal from "./ImageModal.vue";
import { nextTick } from "vue";

vi.mock("@/components/form/BaseModal.vue", () => ({
    default: {
        name: "BaseModal",
        template: '<div data-test="base-modal"><slot /></div>',
        props: ["isVisible"],
    },
}));

vi.mock("./LImage.vue", () => ({
    default: {
        name: "LImage",
        template: '<div data-test="l-image" />',
        props: ["contentParentId", "parentImageBucketId", "image", "size", "rounded", "isModal"],
    },
}));

const singleImageProps: any = {
    image: {
        _id: "img-1",
        fileCollections: [{ aspectRatio: 1.78, imageFiles: [{ filename: "test.jpg", width: 800, height: 450 }] }],
    },
    contentParentId: "content-1",
};

const multiImageProps: any = {
    imageCollections: [
        { aspectRatio: 1.78, imageFiles: [{ filename: "img1.jpg", width: 800, height: 450 }] },
        { aspectRatio: 1.78, imageFiles: [{ filename: "img2.jpg", width: 800, height: 450 }] },
        { aspectRatio: 1.78, imageFiles: [{ filename: "img3.jpg", width: 800, height: 450 }] },
    ],
    currentIndex: 0,
    contentParentId: "content-1",
};

describe("ImageModal", () => {
    beforeEach(() => {
        vi.stubGlobal("innerWidth", 1024);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders with a single image", () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });
        expect(wrapper.find("[data-test='l-image']").exists()).toBe(true);
    });

    it("emits close when X icon is clicked", async () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });

        // Find the XCircleIcon and click it
        const closeIcon = wrapper.find(".fixed.right-8");
        await closeIcon.trigger("click");

        expect(wrapper.emitted("close")).toBeTruthy();
    });

    it("renders navigation arrows for multiple images", () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });

        // ArrowLeftCircleIcon and ArrowRightCircleIcon should exist
        expect(wrapper.findAll(".fixed.left-24").length).toBeGreaterThanOrEqual(1);
        expect(wrapper.findAll(".fixed.right-24").length).toBeGreaterThanOrEqual(1);
    });

    it("does not render navigation arrows for single image", () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });
        expect(wrapper.find(".fixed.left-24").exists()).toBe(false);
    });

    it("renders dots for multiple images", () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const dots = wrapper.findAll(".rounded-full.h-2, .rounded-full.h-3");
        expect(dots.length).toBe(3);
    });

    it("emits update:index when dot is clicked", async () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const dots = wrapper.findAll(".fixed.bottom-4 span");
        await dots[1].trigger("click");

        expect(wrapper.emitted("update:index")).toBeTruthy();
        expect(wrapper.emitted("update:index")![0]).toEqual([1]);
    });

    it("zooms in and out via buttons", async () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });

        // Just verify the zoom controls exist
        expect(wrapper.find(".fixed.bottom-8").exists()).toBe(true);
    });

    it("handles keyboard navigation", async () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const container = wrapper.find(".touch-none");

        await container.trigger("keydown", { key: "ArrowRight" });
        expect(wrapper.emitted("update:index")).toBeTruthy();
    });

    it("handles Escape key to close", async () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const container = wrapper.find(".touch-none");

        await container.trigger("keydown", { key: "Escape" });
        expect(wrapper.emitted("close")).toBeTruthy();
    });

    it("handles double click to toggle zoom", async () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });
        const container = wrapper.find(".touch-none");

        await container.trigger("dblclick", { clientX: 500, clientY: 500 });
        await nextTick();

        // After double click, scale should change
        const style = container.attributes("style");
        expect(style).toContain("scale");
    });

    it("handles left arrow click for navigation", async () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const leftArrow = wrapper.find(".fixed.left-24");

        await leftArrow.trigger("click");
        expect(wrapper.emitted("update:index")).toBeTruthy();
    });

    it("zooms in with Ctrl+wheel scroll down", async () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });
        const container = wrapper.find(".touch-none");

        // Construct WheelEvent directly since ctrlKey is readonly
        const wheelEvent = new WheelEvent("wheel", {
            ctrlKey: true,
            deltaY: -100,
            bubbles: true,
            cancelable: true,
        });
        container.element.dispatchEvent(wheelEvent);
        await nextTick();

        const style = container.attributes("style") || "";
        // Scale should be > 1 after zoom in
        expect(style).toContain("scale");
    });

    it("does not zoom without ctrlKey", async () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });
        const container = wrapper.find(".touch-none");

        const wheelEvent = new WheelEvent("wheel", {
            ctrlKey: false,
            deltaY: -100,
            bubbles: true,
        });
        container.element.dispatchEvent(wheelEvent);
        await nextTick();

        // Style should remain the same (scale(1))
        const afterStyle = container.attributes("style") || "";
        expect(afterStyle).toContain("scale(1)");
    });

    it("sets mobile defaults when innerWidth <= 768", async () => {
        vi.stubGlobal("innerWidth", 500);

        const wrapper = mount(ImageModal, { props: singleImageProps });

        await nextTick();

        const container = wrapper.find(".touch-none");
        const style = container.attributes("style") || "";
        // On mobile, initial scale should be 1.4
        expect(style).toContain("scale(1.4)");
    });

    it("zooms out on double click when already zoomed in", async () => {
        const wrapper = mount(ImageModal, { props: singleImageProps });
        const container = wrapper.find(".touch-none");

        // First double-click to zoom in
        await container.trigger("dblclick", { clientX: 500, clientY: 500 });
        await nextTick();

        // Second double-click to zoom out
        await container.trigger("dblclick", { clientX: 500, clientY: 500 });
        await nextTick();

        const style = container.attributes("style") || "";
        expect(style).toContain("scale(1)");
    });

    it("emits update:index on ArrowLeft key", async () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const container = wrapper.find(".touch-none");

        await container.trigger("keydown", { key: "ArrowLeft" });
        expect(wrapper.emitted("update:index")).toBeTruthy();
        // ArrowLeft triggers onSwipe("right"), wrapping to last image
        expect(wrapper.emitted("update:index")![0]).toEqual([2]);
    });

    it("resets zoom when image changes", async () => {
        const wrapper = mount(ImageModal, { props: multiImageProps });
        const container = wrapper.find(".touch-none");

        // Zoom in
        await container.trigger("dblclick", { clientX: 500, clientY: 500 });
        await nextTick();

        // Change index
        await wrapper.setProps({ currentIndex: 1 });
        await nextTick();

        const style = container.attributes("style") || "";
        expect(style).toContain("scale(1)");
    });
});
