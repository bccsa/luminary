import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { db, DocType, type AuthProviderDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import AuthProviderSelectionModal from "./AuthProviderSelectionModal.vue";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/auth", () => ({
    loginWithProvider: vi.fn(),
    showProviderSelectionModal: ref(true),
}));

vi.mock("@/components/images/LImage.vue", () => ({
    default: {
        name: "LImage",
        props: ["image", "parentImageBucketId", "contentParentId", "size", "rounded"],
        template: "<img />",
    },
}));

import { loginWithProvider, showProviderSelectionModal } from "@/auth";

const mockProviderA: AuthProviderDto = {
    _id: "provider-a",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Acme Corp",
    domain: "acme.auth0.com",
    clientId: "client-a",
    audience: "https://api.acme.com",
    configId: "config-entry-a",
};

const mockProviderB: AuthProviderDto = {
    _id: "provider-b",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Beta Inc",
    domain: "beta.auth0.com",
    clientId: "client-b",
    audience: "https://api.beta.com",
    backgroundColor: "#1a1a2e",
    textColor: "#ffffff",
    configId: "config-entry-b",
};

describe("AuthProviderSelectionModal.vue", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        showProviderSelectionModal.value = true;
        await db.docs.clear();
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("shows empty state when no providers are available", async () => {
        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("auth.no_methods_available");
            expect(wrapper.html()).toContain("auth.contact_support");
        });
    });

    it("renders a button for each provider stored in Dexie", async () => {
        await db.docs.bulkPut([mockProviderA, mockProviderB]);

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Acme Corp");
            expect(wrapper.html()).toContain("Beta Inc");
        });
    });

    it("hides empty state when providers are present", async () => {
        await db.docs.bulkPut([mockProviderA]);

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Acme Corp");
            expect(wrapper.html()).not.toContain("auth.no_methods_available");
        });
    });

    it("calls loginWithProvider with the selected provider when a button is clicked", async () => {
        await db.docs.put(mockProviderA);

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Acme Corp");
        });

        const providerBtn = wrapper
            .findAll("button")
            .find((b) => b.text().includes("Acme Corp"));
        await providerBtn!.trigger("click");

        expect(loginWithProvider).toHaveBeenCalledTimes(1);
        expect(loginWithProvider).toHaveBeenCalledWith(
            expect.objectContaining({ _id: "provider-a" }),
        );
    });

    it("applies custom backgroundColor and textColor from the provider to its button", async () => {
        await db.docs.put(mockProviderB);

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Beta Inc");
        });

        const providerBtn = wrapper
            .findAll("button")
            .find((b) => b.text().includes("Beta Inc"));
        const style = providerBtn!.attributes("style") ?? "";
        expect(style).toContain("background-color");
        expect(style).toContain("color");
    });

    it("sets showProviderSelectionModal to false when the modal emits close", async () => {
        showProviderSelectionModal.value = true;

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await wrapper.findComponent({ name: "LModal" }).vm.$emit("close");

        expect(showProviderSelectionModal.value).toBe(false);
    });

    it("is hidden when isVisible is false", () => {
        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: false },
        });

        expect(wrapper.html()).not.toContain("auth.sign_in");
    });
});
