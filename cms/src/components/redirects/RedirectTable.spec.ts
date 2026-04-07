import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RedirectTable from "./RedirectTable.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { mockRedirectDto, superAdminAccessMap } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({ push: vi.fn() }),
    };
});

describe("RedirectTable", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = superAdminAccessMap;
        await db.docs.bulkPut([mockRedirectDto]);
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("renders table headers", () => {
        const wrapper = mount(RedirectTable);

        expect(wrapper.text()).toContain("From slug");
        expect(wrapper.text()).toContain("To slug");
        expect(wrapper.text()).toContain("Type");
        expect(wrapper.text()).toContain("Last updated");
    });

    it("renders redirect rows", async () => {
        const wrapper = mount(RedirectTable);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("vod");
            expect(wrapper.text()).toContain("live");
        });
    });

    it("renders empty table when no redirects exist", async () => {
        await db.docs.clear();
        const wrapper = mount(RedirectTable);

        expect(wrapper.find("thead").exists()).toBe(true);
        // No tbody content expected
        const tbody = wrapper.find("tbody");
        expect(tbody.text()).toBe("");
    });
});
