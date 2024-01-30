import { describe, it, expect } from "vitest";

import { mount } from "@vue/test-utils";
import AcTable from "./AcTable.vue";

const columns = [
    {
        text: "Year group",
        key: "year_group",
    },
    {
        text: "Name",
        key: "name",
    },
    {
        text: "Progress",
        key: "progress.amount",
    },
];
const items = [
    {
        year_group: "22/23",
        name: "Ada Lovelace",
        progress: {
            amount: 25,
        },
    },
    {
        year_group: "23/24",
        name: "Firmus Piett",
        progress: {
            amount: 42,
        },
    },
];

describe("AcTable", () => {
    it("renders data in a table", () => {
        const wrapper = mount(AcTable, {
            props: {
                columns,
                items,
            },
        });

        expect(wrapper.text()).toContain("Year group");
        expect(wrapper.text()).toContain("Ada Lovelace");
        expect(wrapper.text()).toContain("42");
    });

    it("can render a custom table cell", () => {
        const wrapper = mount(AcTable, {
            props: {
                columns,
                items,
            },
            slots: {
                "item.name": "Custom name content",
            },
        });

        expect(wrapper.text()).toContain("Year group");
        expect(wrapper.text()).not.toContain("Ada Lovelace");
        expect(wrapper.text()).toContain("Custom name content");
    });

    it("can sort a column", async () => {
        const wrapper = mount(AcTable, {
            props: {
                columns,
                items,
            },
        });

        // Click the first column (year group)
        await wrapper.find("button[aria-label='Sort column']").trigger("click");

        expect(wrapper.emitted("update:sortBy")?.length).toBe(1);
        expect(wrapper.emitted("update:sortBy")![0]).toEqual(["year_group"]);
        expect(wrapper.emitted("update:sortDirection")![0]).toEqual(["ascending"]);
    });
});
