import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import OAuthProviderOverview from "./OAuthProviderOverview.vue";
import OAuthProviderFormModal from "./OAuthProviderFormModal.vue";
import OAuthProviderDisplayCard from "./OAuthProviderDisplayCard.vue";
import { db, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import waitForExpect from "wait-for-expect";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            isAuthenticated: true,
            isLoading: false,
        }),
    };
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: { value: { path: "/oauth-providers" } },
        }),
        useRoute: () => ({
            params: {},
            query: {},
        }),
    };
});

describe("OAuthProviderOverview", () => {
    let pinia: ReturnType<typeof createTestingPinia>;

    beforeEach(async () => {
        pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
        setActivePinia(pinia);
        await db.docs.clear();
        accessMap.value = mockData.superAdminAccessMap;
        await db.docs.add(mockData.mockGroup);
        await db.docs.add(mockData.mockAdminGroup);
    });

    afterEach(async () => {
        await db.docs.clear();
    });

    it("renders and shows empty state when there are no providers", async () => {
        const wrapper = mount(OAuthProviderOverview, {
            global: {
                plugins: [pinia],
            },
        });
        await wait(50);
        expect(wrapper.text()).toContain("No OAuth configured");
        expect(wrapper.text()).toContain("Get started by creating your first OAuth configuration");
    });

    it("prefills domain, clientId, audience when opening edit modal", async () => {
        await db.docs.add(mockData.mockOAuthProviderDto);
        const wrapper = mount(OAuthProviderOverview, {
            global: {
                plugins: [pinia],
            },
        });
        await waitForExpect(() => {
            expect(wrapper.findAllComponents(OAuthProviderDisplayCard).length).toBe(1);
        });
        const card = wrapper.findComponent(OAuthProviderDisplayCard);
        await card.vm.$emit("edit", mockData.mockOAuthProviderDto);
        await wrapper.vm.$nextTick();
        const modal = wrapper.findComponent(OAuthProviderFormModal);
        expect(modal.props("localCredentials")).toMatchObject({
            domain: "tenant.auth0.com",
            clientId: "client123",
            audience: "https://api.example.com",
        });
        expect(modal.props("localCredentials").clientSecret).toBe("");
    });

    it("save without new secret updates only public fields", async () => {
        const provider = { ...mockData.mockOAuthProviderDto, credential_id: "cred-1" };
        await db.docs.add(provider);
        const upsertSpy = vi.spyOn(db, "upsert");
        const wrapper = mount(OAuthProviderOverview, {
            global: {
                plugins: [pinia],
            },
        });
        await waitForExpect(() => {
            expect(wrapper.findAllComponents(OAuthProviderDisplayCard).length).toBe(1);
        });
        const card = wrapper.findComponent(OAuthProviderDisplayCard);
        await card.vm.$emit("edit", provider);
        await wrapper.vm.$nextTick();
        const modal = wrapper.findComponent(OAuthProviderFormModal);
        await modal.vm.$emit("update:localCredentials", {
            domain: "updated-domain.auth0.com",
            clientId: provider.clientId,
            clientSecret: "",
            audience: provider.audience,
        });
        await wrapper.vm.$nextTick();
        await modal.vm.$emit("save");
        await waitForExpect(() => {
            expect(upsertSpy).toHaveBeenCalled();
        });
        const upsertCall = upsertSpy.mock.calls[upsertSpy.mock.calls.length - 1];
        const doc = upsertCall[0]?.doc as { domain?: string; credential?: unknown } | undefined;
        expect(doc).toBeDefined();
        expect(doc?.domain).toBe("updated-domain.auth0.com");
        expect(doc?.credential).toBeUndefined();
        upsertSpy.mockRestore();
    });

    it("validation: editing with partial secret invalid", async () => {
        await db.docs.add(mockData.mockOAuthProviderDto);
        const upsertSpy = vi.spyOn(db, "upsert");
        const wrapper = mount(OAuthProviderOverview, {
            global: {
                plugins: [pinia],
            },
        });
        await waitForExpect(() => {
            expect(wrapper.findAllComponents(OAuthProviderDisplayCard).length).toBe(1);
        });
        const card = wrapper.findComponent(OAuthProviderDisplayCard);
        await card.vm.$emit("edit", mockData.mockOAuthProviderDto);
        await wrapper.vm.$nextTick();
        const modal = wrapper.findComponent(OAuthProviderFormModal);
        await modal.vm.$emit("update:localCredentials", {
            domain: "tenant.auth0.com",
            clientId: "client123",
            clientSecret: "newSecret",
            audience: "",
        });
        await wrapper.vm.$nextTick();
        await modal.vm.$emit("save");
        await wait(100);
        expect(upsertSpy).not.toHaveBeenCalled();
        upsertSpy.mockRestore();
    });

    it("create requires full credentials", async () => {
        const upsertSpy = vi.spyOn(db, "upsert");
        const wrapper = mount(OAuthProviderOverview, {
            global: {
                plugins: [pinia],
            },
        });
        (wrapper.vm as { openCreateModal: () => void }).openCreateModal();
        await wrapper.vm.$nextTick();
        const modal = wrapper.findComponent(OAuthProviderFormModal);
        await modal.vm.$emit("save");
        await wait(100);
        expect(upsertSpy).not.toHaveBeenCalled();

        const provider = modal.props("provider");
        await modal.vm.$emit("update:provider", { ...provider, label: "New Provider" });
        await modal.vm.$emit("update:localCredentials", {
            domain: "tenant.auth0.com",
            clientId: "client123",
            clientSecret: "secret456",
            audience: "https://api.example.com",
        });
        await wrapper.vm.$nextTick();
        await modal.vm.$emit("save");
        await waitForExpect(() => {
            expect(upsertSpy).toHaveBeenCalled();
        });
        upsertSpy.mockRestore();
    });
});
