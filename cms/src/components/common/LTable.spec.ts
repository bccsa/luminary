import { describe, it, expect } from "vitest";

import { mount } from "@vue/test-utils";
import LTable from "./LTable.vue";

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

describe("LTable", () => {
    it("renders data in a table", () => {
        const wrapper = mount(LTable, {
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
        const wrapper = mount(LTable, {
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
        const wrapper = mount(LTable, {
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

    it("can paginate the items", async () => {
        const wrapper: any = mount(LTable, {
            props: {
                columns,
                items,
                paginate: true,
                itemsPerPage: 1,
                currentPage: 1,
                "onUpdate:currentPage": (e) => wrapper.setProps({ currentPage: e }),
            },
        });

        expect(wrapper.text()).toContain("Ada Lovelace");
        expect(wrapper.text()).not.toContain("Firmus Piett");
        expect(wrapper.text()).toContain("Go to page 1");
        expect(wrapper.text()).toContain("Go to page 2");

        await wrapper.findAll("button.page")[1].trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted("update:currentPage")![0]).toEqual([2]);
        expect(wrapper.text()).not.toContain("Ada Lovelace");
        expect(wrapper.text()).toContain("Firmus Piett");
    });

    it("sorts with a custom sortMethod", () => {
        const columnsWithCustomSort = [
            {
                text: "Name",
                key: "name",
                sortMethod: (a: any, b: any) => b.name.localeCompare(a.name),
            },
        ];

        const wrapper = mount(LTable, {
            props: {
                columns: columnsWithCustomSort,
                items,
                sortBy: "name",
                sortDirection: "ascending" as const,
            },
        });

        const cells = wrapper.findAll("td");
        // Custom sort reverses alphabetical order
        expect(cells[0].text()).toBe("Firmus Piett");
        expect(cells[1].text()).toBe("Ada Lovelace");
    });

    it("sorts in descending direction", () => {
        const wrapper = mount(LTable, {
            props: {
                columns,
                items,
                sortBy: "name",
                sortDirection: "descending" as const,
            },
        });

        const cells = wrapper.findAll("tbody td");
        // Descending: Firmus Piett before Ada Lovelace
        expect(cells[1].text()).toBe("Firmus Piett");
    });

    it("clicking sorted column twice toggles to descending then resets", async () => {
        const wrapper = mount(LTable, {
            props: {
                columns,
                items,
                sortBy: "year_group",
                sortDirection: "ascending" as const,
            },
        });

        // Click same column again - should toggle to descending
        await wrapper.find("th").trigger("click");
        expect(wrapper.emitted("update:sortDirection")![0]).toEqual(["descending"]);

        // Set to descending and click again - should reset sortBy
        await wrapper.setProps({ sortDirection: "descending" });
        await wrapper.find("th").trigger("click");
        expect(wrapper.emitted("update:sortBy")).toBeDefined();
        const sortByEmits = wrapper.emitted("update:sortBy")!;
        expect(sortByEmits[sortByEmits.length - 1]).toEqual([undefined]);
    });

    it("does not sort when column has sortable: false", async () => {
        const unsortableColumns = [{ text: "Actions", key: "name", sortable: false }];

        const wrapper = mount(LTable, {
            props: {
                columns: unsortableColumns,
                items,
            },
        });

        await wrapper.find("th").trigger("click");
        expect(wrapper.emitted("update:sortBy")).toBeUndefined();
    });
});
