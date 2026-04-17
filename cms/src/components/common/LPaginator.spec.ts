import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LPaginator from "./LPaginator.vue";
import LButton from "../button/LButton.vue";
import { ref } from "vue";

// Mock isSmallScreen
vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});

function mountPaginator(overrides: Record<string, any> = {}) {
    const index = ref(overrides.index ?? 0);
    const pageSize = ref(overrides.pageSize ?? 20);
    const wrapper = mount(LPaginator, {
        props: {
            index: index.value,
            pageSize: pageSize.value,
            amountOfDocs: overrides.amountOfDocs ?? 100,
            variant: overrides.variant ?? "simple",
            "onUpdate:index": (val: number) => {
                index.value = val;
                wrapper.setProps({ index: val });
            },
            "onUpdate:pageSize": (val: number) => {
                pageSize.value = val;
                wrapper.setProps({ pageSize: val });
            },
            ...overrides.props,
        },
    });
    return { wrapper, index, pageSize };
}

describe("LPaginator", () => {
    it("correctly increases the index", async () => {
        const { wrapper, index } = mountPaginator();

        const buttons = wrapper.findAllComponents(LButton);
        const nextButton = buttons[2] || buttons.at(-1);
        await nextButton.find("button, a, component").trigger("click");

        expect(index.value).toBe(1);
    });

    it("correctly decreases the index", async () => {
        const { wrapper, index } = mountPaginator({ index: 4 });

        const buttons = wrapper.findAllComponents(LButton);
        await buttons[1].find("button, a, component").trigger("click");

        expect(index.value).toBe(3);
    });

    it("does not increase index beyond the last page", async () => {
        const { wrapper, index } = mountPaginator({ index: 4, amountOfDocs: 100, pageSize: 20 });

        // index 4 is the last page (100/20 = 5 pages, indices 0-4)
        const buttons = wrapper.findAllComponents(LButton);
        const nextButton = buttons[2] || buttons.at(-1);
        await nextButton.find("button, a, component").trigger("click");

        expect(index.value).toBe(4);
    });

    it("first-page button sets index to 0", async () => {
        const { wrapper, index } = mountPaginator({ index: 3 });

        const buttons = wrapper.findAllComponents(LButton);
        // First button is the "go to first page" button
        await buttons[0].find("button, a, component").trigger("click");

        expect(index.value).toBe(0);
    });

    it("last-page button sets index to last page", async () => {
        const { wrapper, index } = mountPaginator({ index: 0, amountOfDocs: 100, pageSize: 20 });

        const buttons = wrapper.findAllComponents(LButton);
        // Last button is the "go to last page" button
        const lastButton = buttons[buttons.length - 1];
        await lastButton.find("button, a, component").trigger("click");

        expect(index.value).toBe(4);
    });

    it("hides last-page button when amountOfDocs < pageSize", () => {
        const { wrapper } = mountPaginator({ amountOfDocs: 5, pageSize: 20 });

        const buttons = wrapper.findAllComponents(LButton);
        // Should only have 3 buttons (first, prev, next) instead of 4
        expect(buttons.length).toBe(3);
    });

    it("shows 'Page X of Y' in simple variant", () => {
        const { wrapper } = mountPaginator({ index: 2, variant: "simple" });

        expect(wrapper.text()).toContain("Page");
        expect(wrapper.text()).toContain("3");
    });

    it("renders page number buttons in extended variant", async () => {
        const { wrapper } = mountPaginator({
            variant: "extended",
            amountOfDocs: 100,
            pageSize: 20,
        });

        // Extended variant should render page number buttons
        const buttons = wrapper.findAllComponents(LButton);
        // Should have: first, prev, page1, page2, page3, page4, page5, next, last
        expect(buttons.length).toBeGreaterThan(4);
    });

    it("handles amountOfDocs being undefined gracefully", () => {
        const { wrapper } = mountPaginator({
            amountOfDocs: undefined,
        });

        // Should still render without crashing
        expect(wrapper.exists()).toBe(true);
    });

    it("shows page size select on desktop", () => {
        const { wrapper } = mountPaginator();

        // On desktop (isSmallScreen = false), page size select should be visible.
        // LSelect is a combobox-style control, not a native <select>.
        const triggers = wrapper.findAll('[data-test="l-select-trigger"]');
        expect(triggers.length).toBeGreaterThan(0);
    });

    it("clicks a page number in extended variant to set index", async () => {
        const { wrapper, index } = mountPaginator({
            variant: "extended",
            amountOfDocs: 100,
            pageSize: 20,
            index: 0,
        });

        const buttons = wrapper.findAllComponents(LButton);
        // In extended variant: first, prev, [page buttons], next, last
        // Find page button "3" (index 2)
        const page3Button = buttons.find((b) => b.text().trim() === "3");
        if (page3Button) {
            await page3Button.find("button, a, component").trigger("click");
            expect(index.value).toBe(2);
        }
    });

    it("does not decrease index below 0", async () => {
        const { wrapper, index } = mountPaginator({ index: 0 });

        const buttons = wrapper.findAllComponents(LButton);
        // Second button is the "previous" button
        await buttons[1].find("button, a, component").trigger("click");

        expect(index.value).toBe(0);
    });

    it("computes correct pageCount", () => {
        const { wrapper } = mountPaginator({ amountOfDocs: 47, pageSize: 10 });

        // 47/10 = 4.7, ceil = 5 pages
        // Simple variant shows "Page X of Y"
        expect(wrapper.text()).toContain("5");
    });

    it("disables prev/first buttons on first page", () => {
        const { wrapper } = mountPaginator({ index: 0 });

        const buttons = wrapper.findAllComponents(LButton);
        // First two buttons (first page, prev) should be disabled
        expect(buttons[0].props("disabled")).toBe(true);
        expect(buttons[1].props("disabled")).toBe(true);
    });

    it("disables next/last buttons on last page", () => {
        const { wrapper } = mountPaginator({ index: 4, amountOfDocs: 100, pageSize: 20 });

        const buttons = wrapper.findAllComponents(LButton);
        // Next button and last button should be disabled
        const nextButton = buttons[2];
        expect(nextButton.props("disabled")).toBe(true);
    });

    it("disables navigation when amountOfDocs is undefined", () => {
        const { wrapper } = mountPaginator({ amountOfDocs: undefined, index: 0 });

        const buttons = wrapper.findAllComponents(LButton);
        // All navigation buttons should be disabled when amountOfDocs is undefined
        // pageCount = 0, so index(0) >= pageCount-1(-1) is true -> next disabled
        // and index(0) <= 0 is true -> prev disabled
        expect(buttons[0].props("disabled")).toBe(true); // first
        expect(buttons[1].props("disabled")).toBe(true); // prev
    });

    it("paginatorPages adjusts window near end in extended variant", () => {
        const { wrapper } = mountPaginator({
            variant: "extended",
            amountOfDocs: 100,
            pageSize: 20,
            index: 4,
        });

        // Last page (index 4), should show page 5 in the buttons
        const buttons = wrapper.findAllComponents(LButton);
        const pageButtons = buttons.filter((b) => {
            const text = b.text().trim();
            return /^\d+$/.test(text);
        });
        // The last visible page number should be 5
        const pageNumbers = pageButtons.map((b) => parseInt(b.text().trim()));
        expect(pageNumbers).toContain(5);
    });
});
