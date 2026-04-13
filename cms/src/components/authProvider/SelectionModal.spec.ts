import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { db, DocType, type AuthProviderDto } from "luminary-shared";
import SelectionModal from "./SelectionModal.vue";
import waitForExpect from "wait-for-expect";

// Mock loginWithProvider from @/auth so we don't trigger real OAuth flows
vi.mock("@/auth", () => ({
    loginWithProvider: vi.fn(),
}));

import { loginWithProvider } from "@/auth";

const mockProviderA: AuthProviderDto = {
    _id: "provider-a",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Acme Corp",
    domain: "acme.auth0.com",
    clientId: "client-a",
    audience: "https://api.acme.com",
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
};

describe("SelectionModal.vue", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    // ── Empty state ───────────────────────────────────────────────────────────

    it("shows empty state when no providers are available", async () => {
        const wrapper = mount(SelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("No sign-in methods available");
        });
    });

    // ── Provider list ─────────────────────────────────────────────────────────

    it("renders a button for each provider stored in Dexie", async () => {
        await db.docs.bulkPut([mockProviderA, mockProviderB]);

        const wrapper = mount(SelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Continue with Acme Corp");
            expect(wrapper.html()).toContain("Continue with Beta Inc");
        });
    });

    it("hides empty state when providers are present", async () => {
        await db.docs.bulkPut([mockProviderA]);

        const wrapper = mount(SelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("No sign-in methods available");
        });
    });

    // ── Login action ──────────────────────────────────────────────────────────

    it("calls loginWithProvider with the selected provider when a button is clicked", async () => {
        await db.docs.put(mockProviderA);

        const wrapper = mount(SelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Continue with Acme Corp");
        });

        const providerBtn = wrapper
            .findAll("button")
            .find((b) => b.text().includes("Continue with Acme Corp"));
        await providerBtn!.trigger("click");

        expect(loginWithProvider).toHaveBeenCalledTimes(1);
        expect(loginWithProvider).toHaveBeenCalledWith(
            expect.objectContaining({ _id: "provider-a" }),
        );
    });

    // ── Custom styling ────────────────────────────────────────────────────────

    it("applies custom backgroundColor from the provider to its button", async () => {
        await db.docs.put(mockProviderB);

        const wrapper = mount(SelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Continue with Beta Inc");
        });

        const providerBtn = wrapper
            .findAll("button")
            .find((b) => b.text().includes("Continue with Beta Inc"));
        expect(providerBtn!.attributes("style")).toContain("background-color");
    });

    // ── Visibility ────────────────────────────────────────────────────────────

    it("is hidden when isVisible is false", () => {
        const wrapper = mount(SelectionModal, {
            props: { isVisible: false },
        });

        // The LModal content should not be rendered when not visible
        expect(wrapper.html()).not.toContain("Sign in");
    });
});
