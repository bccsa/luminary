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
        it("emits close when mousedown directly on container", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const container = wrapper.find('[data-test="modal-container"]');
            await container.trigger("mousedown");

            expect(wrapper.emitted("close")).toBeTruthy();
        });

        it("does not emit close when mousedown originates inside modal content", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const heading = wrapper.find("h2");
            await heading.trigger("mousedown");

            expect(wrapper.emitted("close")).toBeFalsy();
        });

        it("does not emit close when mousedown inside modal and mouseup on container (drag scenario)", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test",
                    isVisible: true,
                },
            });

            const heading = wrapper.find("h2");
            const container = wrapper.find('[data-test="modal-container"]');

            await heading.trigger("mousedown");
            await container.trigger("mouseup");

            expect(wrapper.emitted("close")).toBeFalsy();
        });
    });
});
