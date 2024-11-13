import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LModal from "./LModal.vue";
import waitForExpect from "wait-for-expect";

describe("LModal", () => {
    describe("display", () => {
        it("displays heading", async () => {
            const wrapper = mount(LModal, {
                props: {
                    heading: "Test Heading",
                    isVisible: true,
                },
            });

            const body = document.querySelector("body");

            await wrapper.vm.$nextTick();

            await waitForExpect(() => {});
            expect(body!.innerHTML).toContain("Test Heading");
        });
    });
});
