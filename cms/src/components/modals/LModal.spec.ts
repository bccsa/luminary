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
});
