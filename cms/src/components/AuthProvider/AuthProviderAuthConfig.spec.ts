import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { DocType, type AuthProviderDto, type AuthProviderConfigDto } from "luminary-shared";
import AuthProviderAuthConfig from "./AuthProviderAuthConfig.vue";

const mockProvider: AuthProviderDto = {
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Test Provider",
    domain: "test.auth0.com",
    clientId: "client-id-1",
    audience: "https://api.test.com",
};

const mockConfig: AuthProviderConfigDto = {
    _id: "config-1",
    type: DocType.AuthProviderConfig,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    providerId: "provider-1",
    claimNamespace: "https://tenant.example.com",
};

describe("AuthProviderAuthConfig.vue", () => {
    // ── Field rendering ───────────────────────────────────────────────────────

    it("renders domain, clientId, and audience inputs with current values", () => {
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider: mockProvider, isEditing: false },
        });

        expect((wrapper.find("[name='domain']").element as HTMLInputElement).value).toBe(
            "test.auth0.com",
        );
        expect((wrapper.find("[name='clientId']").element as HTMLInputElement).value).toBe(
            "client-id-1",
        );
        expect((wrapper.find("[name='audience']").element as HTMLInputElement).value).toBe(
            "https://api.test.com",
        );
    });

    it("shows required asterisk on domain, clientId, and audience when not editing", () => {
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider: mockProvider, isEditing: false },
        });

        // Three required field markers (domain, clientId, audience)
        const asterisks = wrapper.findAll("span.text-red-500");
        expect(asterisks.length).toBeGreaterThanOrEqual(3);
    });

    it("hides required asterisks when editing", () => {
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider: mockProvider, isEditing: true },
        });

        const asterisks = wrapper.findAll("span.text-red-500");
        expect(asterisks).toHaveLength(0);
    });

    it("disables all inputs when disabled prop is true", () => {
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider: mockProvider, isEditing: false, disabled: true },
        });

        const inputs = wrapper.findAll("input");
        inputs.forEach((input) => {
            expect((input.element as HTMLInputElement).disabled).toBe(true);
        });
    });

    // ── Domain normalisation (triggered on blur) ──────────────────────────────
    // LInput has inheritAttrs:false + v-bind="attrsWithoutStyles" on the native
    // <input>, so @blur placed on <LInput> is forwarded to the native element.
    // We pass a reactive() object so we can observe direct property mutations
    // made by defineModel (which mutates the prop rather than replacing it).

    it("strips https:// protocol from domain on blur", async () => {
        const provider = reactive({ ...mockProvider, domain: "" });
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider, isEditing: false },
        });

        const domainInput = wrapper.find("[name='domain']");
        await domainInput.setValue("https://auth.example.com");
        await domainInput.trigger("blur");
        await wrapper.vm.$nextTick();

        expect(provider.domain).toBe("auth.example.com");
    });

    it("strips http:// protocol from domain on blur", async () => {
        const provider = reactive({ ...mockProvider, domain: "" });
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider, isEditing: false },
        });

        const domainInput = wrapper.find("[name='domain']");
        await domainInput.setValue("http://auth.example.com");
        await domainInput.trigger("blur");
        await wrapper.vm.$nextTick();

        expect(provider.domain).toBe("auth.example.com");
    });

    it("strips trailing slashes from domain on blur", async () => {
        const provider = reactive({ ...mockProvider, domain: "" });
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider, isEditing: false },
        });

        const domainInput = wrapper.find("[name='domain']");
        await domainInput.setValue("auth.example.com///");
        await domainInput.trigger("blur");
        await wrapper.vm.$nextTick();

        expect(provider.domain).toBe("auth.example.com");
    });

    it("strips paths after the hostname on blur", async () => {
        const provider = reactive({ ...mockProvider, domain: "" });
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider, isEditing: false },
        });

        const domainInput = wrapper.find("[name='domain']");
        await domainInput.setValue("auth.example.com/some/path");
        await domainInput.trigger("blur");
        await wrapper.vm.$nextTick();

        expect(provider.domain).toBe("auth.example.com");
    });

    it("lowercases the domain on blur", async () => {
        const provider = reactive({ ...mockProvider, domain: "" });
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider, isEditing: false },
        });

        const domainInput = wrapper.find("[name='domain']");
        await domainInput.setValue("Auth.Example.COM");
        await domainInput.trigger("blur");
        await wrapper.vm.$nextTick();

        expect(provider.domain).toBe("auth.example.com");
    });

    it("leaves a blank domain empty on blur", async () => {
        const provider = reactive({ ...mockProvider, domain: "" });
        const wrapper = mount(AuthProviderAuthConfig, {
            props: { provider, isEditing: false },
        });

        const domainInput = wrapper.find("[name='domain']");
        await domainInput.setValue("   ");
        await domainInput.trigger("blur");
        await wrapper.vm.$nextTick();

        // Whitespace-only trims to empty string
        expect(provider.domain.trim()).toBe("");
    });
});
