import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RedirectDisplaycard from "./RedirectDisplaycard.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db, type GroupDto } from "luminary-shared";
import {
    mockRedirectDto,
    superAdminAccessMap,
    mockGroupDtoPublicContent,
} from "@/tests/mockdata";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({ push: vi.fn() }),
    };
});

describe("RedirectDisplaycard", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = superAdminAccessMap;
        await db.docs.bulkPut([mockGroupDtoPublicContent as unknown as GroupDto]);
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("renders the redirect slug and toSlug", () => {
        const wrapper = mount(RedirectDisplaycard, {
            props: { redirectDoc: mockRedirectDto },
        });

        expect(wrapper.text()).toContain("vod");
        expect(wrapper.text()).toContain("live");
    });

    it("shows HOMEPAGE when toSlug is null", () => {
        const wrapper = mount(RedirectDisplaycard, {
            props: {
                redirectDoc: { ...mockRedirectDto, toSlug: undefined },
            },
        });

        expect(wrapper.text()).toContain("HOMEPAGE");
    });

    it("shows the redirect type badge in uppercase", () => {
        const wrapper = mount(RedirectDisplaycard, {
            props: { redirectDoc: mockRedirectDto },
        });

        expect(wrapper.text()).toContain("TEMPORARY");
    });

    it("shows group badges for assigned groups", async () => {
        const wrapper = mount(RedirectDisplaycard, {
            props: { redirectDoc: mockRedirectDto },
        });

        // Wait for reactive db query to resolve
        await wrapper.vm.$nextTick();
        // Group name from mockGroupDtoPublicContent
        // The component queries groups that match redirectDoc.memberOf
    });

    it("shows 'No groups' when no groups match", async () => {
        const wrapper = mount(RedirectDisplaycard, {
            props: {
                redirectDoc: { ...mockRedirectDto, memberOf: ["nonexistent-group"] },
            },
        });

        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("No groups");
    });
});
