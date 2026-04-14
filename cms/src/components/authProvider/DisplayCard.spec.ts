import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { accessMap, DocType, type AuthProviderDto, type GroupDto } from "luminary-shared";
import DisplayCard from "./DisplayCard.vue";

const mockProvider: AuthProviderDto = {
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-super-admins"],
    label: "Test Provider",
    domain: "test.auth0.com",
    clientId: "client-id-1",
    audience: "https://api.test.com",
    configId: "config-entry-1",
};

const mockGroup: GroupDto = {
    _id: "group-super-admins",
    type: DocType.Group,
    name: "Super Admins",
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-super-admins"],
    acl: [],
};

const authProviderEditAccessMap = {
    "group-super-admins": {
        authProvider: { view: true, edit: true, delete: true, assign: true },
    },
} as any;

const readOnlyAccessMap = {
    "group-super-admins": {
        authProvider: { view: true },
    },
} as any;

describe("DisplayCard.vue", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        accessMap.value = authProviderEditAccessMap;
    });

    afterEach(() => {
        accessMap.value = {};
    });

    // ── Label display ─────────────────────────────────────────────────────────

    it("displays the provider label (capitalised)", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: { ...mockProvider, label: "acme corp" }, groups: [] },
        });

        expect(wrapper.html()).toContain("Acme corp");
    });

    it("falls back to domain when label is empty", () => {
        const wrapper = mount(DisplayCard, {
            props: {
                provider: { ...mockProvider, label: "", domain: "fallback.auth0.com" },
                groups: [],
            },
        });

        expect(wrapper.html()).toContain("fallback.auth0.com");
    });

    it("falls back to 'Auth provider' when both label and domain are empty", () => {
        const wrapper = mount(DisplayCard, {
            props: {
                provider: { ...mockProvider, label: "", domain: "" },
                groups: [],
            },
        });

        expect(wrapper.html()).toContain("Auth provider");
    });

    // ── Credentials badge ─────────────────────────────────────────────────────

    it("shows 'Credentials Configured' badge when domain and clientId are set", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: mockProvider, groups: [] },
        });

        expect(wrapper.html()).toContain("Credentials Configured");
        expect(wrapper.html()).not.toContain("No Credentials");
    });

    it("shows 'No Credentials' badge when domain is missing", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: { ...mockProvider, domain: "" }, groups: [] },
        });

        expect(wrapper.html()).toContain("No Credentials");
        expect(wrapper.html()).not.toContain("Credentials Configured");
    });

    it("shows 'No Credentials' badge when clientId is missing", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: { ...mockProvider, clientId: "" }, groups: [] },
        });

        expect(wrapper.html()).toContain("No Credentials");
    });

    // ── Incoming edit badge ───────────────────────────────────────────────────

    it("shows 'Incoming edit' badge when isModified is true", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: mockProvider, groups: [], isModified: true },
        });

        expect(wrapper.html()).toContain("Incoming edit");
    });

    it("hides 'Incoming edit' badge when isModified is false", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: mockProvider, groups: [], isModified: false },
        });

        expect(wrapper.html()).not.toContain("Incoming edit");
    });

    // ── Group membership display ──────────────────────────────────────────────

    it("shows group name for groups in provider.memberOf", () => {
        const wrapper = mount(DisplayCard, {
            props: { provider: mockProvider, groups: [mockGroup] },
        });

        expect(wrapper.html()).toContain("Super Admins");
    });

    it("shows 'No groups' when provider has no matching groups", () => {
        const wrapper = mount(DisplayCard, {
            props: {
                provider: { ...mockProvider, memberOf: ["group-unknown"] },
                groups: [mockGroup],
            },
        });

        expect(wrapper.html()).toContain("No groups");
    });

    // ── Edit event ────────────────────────────────────────────────────────────

    it("emits 'edit' with the provider when clicked and user has edit permission", async () => {
        accessMap.value = authProviderEditAccessMap;
        const wrapper = mount(DisplayCard, {
            props: { provider: mockProvider, groups: [] },
        });

        await wrapper.trigger("click");

        expect(wrapper.emitted("edit")).toHaveLength(1);
        expect(wrapper.emitted("edit")![0][0]).toMatchObject({ _id: "provider-1" });
    });

    it("does not emit 'edit' when user lacks edit permission", async () => {
        accessMap.value = readOnlyAccessMap;
        const wrapper = mount(DisplayCard, {
            props: { provider: mockProvider, groups: [] },
        });

        await wrapper.trigger("click");

        expect(wrapper.emitted("edit")).toBeUndefined();
    });
});
