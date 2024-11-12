import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LModal from "./LModal.vue";

describe("LModal", () => {
    describe("display", () => {
        it("displays heading", () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                },
            });

            expect(wrapper.html()).toContain("Test Heading");
        });
        it("displays left button text", () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                    bLeftText: "Test Button Left",
                },
            });

            expect(wrapper.html()).toContain("Test Button Left");
        });
        it("displays right button text", () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                    bLeftText: "Test Button Left",
                    bRightText: "Test Button Right",
                },
            });

            expect(wrapper.html()).toContain("Test Button Right");
        });
        it("displays right button only when a left button exists", () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                    bRightText: "Test Button Right",
                },
            });

            const rightButton = wrapper.find('[name="right-button"]');

            expect(rightButton.exists()).toBe(false);
        });
    });
    describe("functionality", () => {
        it("emits close when close button is clicked", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                },
            });

            const closeBtn = wrapper.find("[name='close-button']");

            await closeBtn.trigger("click");

            expect(wrapper.emitted()).toHaveProperty("close");
        });
        it("emits left button click when left button is clicked", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                    bLeftText: "Test Button Left",
                },
            });

            const leftBtn = wrapper.find("[name='left-button']");

            await leftBtn.trigger("click");

            expect(wrapper.emitted()).toHaveProperty("b-left-click");
        });
        it("emits left button click when left button is clicked", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                    bLeftText: "Test Button Left",
                    bRightText: "Test Button Right",
                },
            });

            const rightBtn = wrapper.find("[name='right-button']");

            await rightBtn.trigger("click");

            expect(wrapper.emitted()).toHaveProperty("b-right-click");
        });
    });
});
