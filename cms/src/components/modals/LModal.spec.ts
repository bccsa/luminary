import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LModal from "./LModal.vue";

describe("LModal", () => {
    describe("display", () => {
        it("displays heading", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                },
            });

            expect(wrapper.html()).toContain("Test Heading");
        });
    });

    describe("closing behavior", () => {
        it("closes when mousedown directly on backdrop", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const backdrop = wrapper.find('[data-test="modal-backdrop"]');
            await backdrop.trigger("mousedown");

            expect(wrapper.emitted("update:isVisible")).toBeTruthy();
            expect(wrapper.emitted("update:isVisible")![0]).toEqual([false]);
        });

        it("does not close when mousedown originates inside modal content", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const modalContent = wrapper.find('[data-test="modal-content"]');
            await modalContent.trigger("mousedown");

            expect(wrapper.emitted("update:isVisible")).toBeFalsy();
        });

        it("does not close when mousedown inside modal and mouseup on backdrop (drag scenario)", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const modalContent = wrapper.find('[data-test="modal-content"]');
            const backdrop = wrapper.find('[data-test="modal-backdrop"]');

            await modalContent.trigger("mousedown");
            await backdrop.trigger("mouseup");

            expect(wrapper.emitted("update:isVisible")).toBeFalsy();
        });

        it("closes on Escape key", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const modalContent = wrapper.find('[data-test="modal-content"]');
            await modalContent.trigger("keydown", { key: "Escape" });

            expect(wrapper.emitted("update:isVisible")).toBeTruthy();
            expect(wrapper.emitted("update:isVisible")![0]).toEqual([false]);
        });
    });
});
