import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import UserFilterOptions from "./UserFilterOptions.vue";
import UserFilterOptionsDesktop from "./UserFilterOptionsDesktop.vue";
import UserFilterOptionsMobile from "./UserFilterOptionsMobile.vue";
import type { GroupDto } from "luminary-shared";

const mockGroups: GroupDto[] = [
    { _id: "group-1", type: "group" as any, name: "Group A", updatedTimeUtc: 1, acl: [] },
    { _id: "group-2", type: "group" as any, name: "Group B", updatedTimeUtc: 1, acl: [] },
];

function mountFilterOptions(overrides: Record<string, any> = {}) {
    const queryOptions = overrides.queryOptions ?? { groups: [], search: "", pageSize: 20, pageIndex: 0 };
    const wrapper = mount(UserFilterOptions, {
        props: {
            groups: overrides.groups ?? mockGroups,
            isSmallScreen: overrides.isSmallScreen ?? false,
            queryOptions,
            "onUpdate:queryOptions": (val: any) => {
                wrapper.setProps({ queryOptions: val });
            },
        },
    });
    return { wrapper, queryOptions };
}

describe("UserFilterOptions", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders desktop variant when isSmallScreen is false", () => {
        const { wrapper } = mountFilterOptions({ isSmallScreen: false });

        expect(wrapper.findComponent(UserFilterOptionsDesktop).exists()).toBe(true);
        expect(wrapper.findComponent(UserFilterOptionsMobile).exists()).toBe(false);
    });

    it("renders mobile variant when isSmallScreen is true", () => {
        const { wrapper } = mountFilterOptions({ isSmallScreen: true });

        expect(wrapper.findComponent(UserFilterOptionsMobile).exists()).toBe(true);
        expect(wrapper.findComponent(UserFilterOptionsDesktop).exists()).toBe(false);
    });

    it("passes groups to child component", () => {
        const { wrapper } = mountFilterOptions({ isSmallScreen: false });

        const desktop = wrapper.findComponent(UserFilterOptionsDesktop);
        expect(desktop.props("groups")).toEqual(mockGroups);
    });

    it("debounced search updates queryOptions.search", async () => {
        const { wrapper } = mountFilterOptions({ isSmallScreen: false });

        const desktop = wrapper.findComponent(UserFilterOptionsDesktop);
        // Update the query model on the child
        await desktop.vm.$emit("update:query", "test search");

        // Before debounce, queryOptions.search should still be empty
        expect(wrapper.props("queryOptions").search).toBe("");

        // Advance past the debounce timer
        vi.advanceTimersByTime(600);
        await wrapper.vm.$nextTick();

        expect(wrapper.props("queryOptions").search).toBe("test search");
    });

    it("resetQueryOptions resets all fields", async () => {
        const { wrapper } = mountFilterOptions({
            isSmallScreen: false,
            queryOptions: { groups: ["group-1"], search: "test", pageSize: 50, pageIndex: 3 },
        });

        const desktop = wrapper.findComponent(UserFilterOptionsDesktop);
        // Call the reset prop
        const resetFn = desktop.props("reset") as Function;
        resetFn();

        await wrapper.vm.$nextTick();

        const opts = wrapper.props("queryOptions");
        expect(opts.groups).toEqual([]);
        expect(opts.search).toBe("");
        expect(opts.pageSize).toBe(20);
        expect(opts.pageIndex).toBe(0);
    });
});
