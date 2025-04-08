import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LPaginator from "./LPaginator.vue";
import LButton from "../button/LButton.vue";

describe("LPaginator", () => {
    it("correctly increases the index", async () => {
        const wrapper = mount(LPaginator, {
            props: {
                size: 20,
                index: 0,
            },
        });

        const buttons = wrapper.findAllComponents(LButton);
        await buttons[1].trigger("click");

        expect(wrapper.vm.index).toBe(1);
    });
    it("correctly decreases the index", async () => {
        const wrapper = mount(LPaginator, {
            props: {
                size: 20,
                index: 4,
            },
        });

        const buttons = wrapper.findAllComponents(LButton);
        await buttons[0].trigger("click");

        expect(wrapper.vm.index).toBe(3);
    });
});
