import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import OAuthProviderFormModal from "./OAuthProviderFormModal.vue";
import LInput from "../forms/LInput.vue";
import { DocType, type OAuthProviderDto, type Auth0CredentialDto, type GroupDto } from "luminary-shared";
import * as mockData from "@/tests/mockdata";

vi.mock("@/composables/storageSelection", () => ({
    storageSelection: () => ({
        getBucketById: vi.fn(() => null),
    }),
}));

describe("OAuthProviderFormModal", () => {
    const mockProvider: OAuthProviderDto = {
        _id: "oauth-1",
        type: DocType.OAuthProvider,
        updatedTimeUtc: Date.now(),
        memberOf: [],
        label: "Test Provider",
        providerType: "auth0",
    };

    const defaultProps = {
        isVisible: true,
        provider: mockProvider,
        localCredentials: {
            domain: "",
            clientId: "",
            clientSecret: "",
            audience: "",
        } as Auth0CredentialDto,
        isEditing: false,
        isLoading: false,
        errors: undefined,
        availableGroups: [mockData.mockGroup] as GroupDto[],
        canDelete: false,
        isFormValid: true,
        hasAttemptedSubmit: false,
        hasValidCredentials: false,
    };

    beforeEach(() => {
        defaultProps.provider = { ...mockProvider };
        defaultProps.localCredentials = {
            domain: "",
            clientId: "",
            clientSecret: "",
            audience: "",
        };
    });

    async function expandCredentials(wrapper: ReturnType<typeof mount>) {
        const buttons = wrapper.findAll("button");
        const setButton = buttons.find((b) => /Set|Update/.test(b.text()));
        if (setButton) await setButton.trigger("click");
        await wrapper.vm.$nextTick();
    }

    it("renders credential inputs (domain, clientId, clientSecret, audience)", async () => {
        const wrapper = mount(OAuthProviderFormModal, {
            props: defaultProps,
            global: {
                stubs: { ImageEditor: true },
            },
        });
        await expandCredentials(wrapper);
        expect(wrapper.text()).toContain("Domain");
        expect(wrapper.text()).toContain("Client ID");
        expect(wrapper.text()).toContain("Client Secret");
        expect(wrapper.text()).toContain("Audience");
    });

    it("shows domain, clientId, audience in inputs when localCredentials has those values", async () => {
        const credentials: Auth0CredentialDto = {
            domain: "tenant.auth0.com",
            clientId: "client123",
            clientSecret: "",
            audience: "https://api.example.com",
        };
        const wrapper = mount(OAuthProviderFormModal, {
            props: {
                ...defaultProps,
                localCredentials: credentials,
            },
            global: {
                stubs: { ImageEditor: true },
            },
        });
        await expandCredentials(wrapper);
        const inputs = wrapper.findAllComponents(LInput);
        const byName = (name: string) => inputs.find((w) => w.props("name") === name);
        expect(byName("domain")?.props("modelValue")).toBe("tenant.auth0.com");
        expect(byName("clientId")?.props("modelValue")).toBe("client123");
        expect(byName("audience")?.props("modelValue")).toBe("https://api.example.com");
    });

    it("binds credential inputs to localCredentials model", async () => {
        const wrapper = mount(OAuthProviderFormModal, {
            props: defaultProps,
            global: {
                stubs: { ImageEditor: true },
            },
        });
        await expandCredentials(wrapper);
        const domainInput = wrapper.findAllComponents(LInput).find((w) => w.props("name") === "domain");
        expect(domainInput?.props("modelValue")).toBe("");
        await wrapper.setProps({
            localCredentials: {
                domain: "updated.com",
                clientId: "",
                clientSecret: "",
                audience: "",
            },
        });
        await wrapper.vm.$nextTick();
        expect(wrapper.findAllComponents(LInput).find((w) => w.props("name") === "domain")?.props("modelValue")).toBe("updated.com");
    });
});
