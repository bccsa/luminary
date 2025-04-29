import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LPaginator from "./LPaginator.vue";
import LButton from "../button/LButton.vue";
import { ref } from "vue";

describe("LPaginator", () => {
    it("correctly increases the index", async () => {
        const index = ref(0);
        const pageSize = ref(20);
        const wrapper = mount(LPaginator, {
            props: {
                index: index.value,
                pageSize: pageSize.value,
                amountOfDocs: 100,
                "onUpdate:index": (val) => (index.value = val),
                "onUpdate:pageSize": (val) => (pageSize.value = val),
            },
        });

        const buttons = wrapper.findAllComponents(LButton);

        await buttons[1].trigger("click");

        expect(index.value).toBe(1);
    });
    it("correctly decreases the index", async () => {
        const index = ref(0);
        const pageSize = ref(20);
        const wrapper = mount(LPaginator, {
            props: {
                index: index.value,
                pageSize: pageSize.value,
                amountOfDocs: 100,
                "onUpdate:index": (val) => (index.value = val),
                "onUpdate:pageSize": (val) => (pageSize.value = val),
            },
        });

        const buttons = wrapper.findAllComponents(LButton);
        await buttons[0].trigger("click");

        expect(wrapper.vm.index).toBe(3);
    });
});
