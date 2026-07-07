import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import FilterOptions from "./FilterOptions.vue";
import type { GroupDto } from "luminary-shared";

const mockGroups: GroupDto[] = [
    { _id: "group-1", type: "group" as any, name: "Group A", updatedTimeUtc: 1, acl: [] },
    { _id: "group-2", type: "group" as any, name: "Group B", updatedTimeUtc: 1, acl: [] },
];

function mountFilterOptions(overrides: Record<string, any> = {}) {
    return mount(FilterOptions, {
        props: {
            groups: overrides.groups ?? mockGroups,
            isSmallScreen: overrides.isSmallScreen ?? false,
            debounceMs: overrides.debounceMs ?? 0,
            search: overrides.search ?? "",
            selectedGroups: overrides.selectedGroups ?? [],
            "onUpdate:search": overrides["onUpdate:search"],
            "onUpdate:selectedGroups": overrides["onUpdate:selectedGroups"],
            onReset: overrides.onReset,
        },
        slots: overrides.slots,
    });
}

describe("FilterOptions", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders the desktop group combobox when groups are provided", () => {
        const wrapper = mountFilterOptions({ isSmallScreen: false });
        expect(wrapper.findComponent({ name: "LCombobox" }).exists()).toBe(true);
    });

    it("hides the group filter entirely when no groups are provided", () => {
        const wrapper = mountFilterOptions({ groups: [], isSmallScreen: false });
        expect(wrapper.findComponent({ name: "LCombobox" }).exists()).toBe(false);
    });

    it("emits update:search immediately when debounceMs is 0", async () => {
        const onUpdateSearch = vi.fn();
        const wrapper = mountFilterOptions({ "onUpdate:search": onUpdateSearch });

        await wrapper.find("[data-test='search-input']").setValue("hello");

        expect(onUpdateSearch).toHaveBeenLastCalledWith("hello");
    });

    it("debounces update:search when debounceMs is set", async () => {
        const onUpdateSearch = vi.fn();
        const wrapper = mountFilterOptions({ debounceMs: 500, "onUpdate:search": onUpdateSearch });

        await wrapper.find("[data-test='search-input']").setValue("hello");

        // Not committed yet — still typing.
        expect(onUpdateSearch).not.toHaveBeenCalled();

        vi.advanceTimersByTime(600);
        await wrapper.vm.$nextTick();

        expect(onUpdateSearch).toHaveBeenLastCalledWith("hello");
    });

    it("shows selected group tags and removes one on click", async () => {
        const onUpdateSelectedGroups = vi.fn();
        const wrapper = mountFilterOptions({
            selectedGroups: ["group-1", "group-2"],
            "onUpdate:selectedGroups": onUpdateSelectedGroups,
        });

        expect(wrapper.text()).toContain("Group A");
        expect(wrapper.text()).toContain("Group B");

        await wrapper.findComponent({ name: "LTag" }).vm.$emit("remove");

        expect(onUpdateSelectedGroups).toHaveBeenCalledWith(["group-2"]);
    });

    it("resets search and selected groups and emits reset", async () => {
        const onUpdateSearch = vi.fn();
        const onUpdateSelectedGroups = vi.fn();
        const onReset = vi.fn();
        const wrapper = mountFilterOptions({
            search: "hello",
            selectedGroups: ["group-1"],
            "onUpdate:search": onUpdateSearch,
            "onUpdate:selectedGroups": onUpdateSelectedGroups,
            onReset,
        });

        await wrapper.find("[data-test='reset-filters']").trigger("click");

        expect(onUpdateSearch).toHaveBeenCalledWith("");
        expect(onUpdateSelectedGroups).toHaveBeenCalledWith([]);
        expect(onReset).toHaveBeenCalled();
    });

    it("renders the mobile layout with an Adjustments button opening a filter modal", async () => {
        const wrapper = mountFilterOptions({ isSmallScreen: true });

        expect(wrapper.find("[data-test='open-mobile-filters']").exists()).toBe(true);
        // The desktop-only inline combobox is not rendered next to the search bar on mobile.
        expect(wrapper.findComponent({ name: "LCombobox" }).exists()).toBe(false);

        await wrapper.find("[data-test='open-mobile-filters']").trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.findComponent({ name: "LModal" }).props("isVisible")).toBe(true);
    });

    it("renders the extra-filters slot on desktop", () => {
        const wrapper = mountFilterOptions({
            isSmallScreen: false,
            slots: { "extra-filters": "<div data-test='extra'>Extra</div>" },
        });

        expect(wrapper.find("[data-test='extra']").exists()).toBe(true);
    });

    it("falls back to the extra-filters slot inside the mobile modal when extra-filters-mobile is not provided", async () => {
        const wrapper = mountFilterOptions({
            isSmallScreen: true,
            slots: { "extra-filters": "<div data-test='extra'>Extra</div>" },
        });

        await wrapper.find("[data-test='open-mobile-filters']").trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.find("[data-test='extra']").exists()).toBe(true);
    });

    it("replaces the built-in search input with the search slot when provided", () => {
        const wrapper = mountFilterOptions({
            slots: { search: "<input data-test='custom-search' />" },
        });

        expect(wrapper.find("[data-test='custom-search']").exists()).toBe(true);
        expect(wrapper.find("[data-test='search-input']").exists()).toBe(false);
    });

    it("does not require the search model when a custom search slot owns it instead", () => {
        // No `search`/`onUpdate:search` wired at all — mirrors a page (like ContentOverview)
        // that binds its own search state entirely inside the `search` slot.
        expect(() =>
            mount(FilterOptions, {
                props: { groups: mockGroups },
                slots: { search: "<input data-test='custom-search' />" },
            }),
        ).not.toThrow();
    });

    it("renders page-owned chips via the selected-filters slot", () => {
        const wrapper = mountFilterOptions({
            slots: { "selected-filters": "<div data-test='custom-chips'>Custom chips</div>" },
        });

        expect(wrapper.find("[data-test='custom-chips']").exists()).toBe(true);
    });
});
