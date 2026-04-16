import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { DocType, type AuthProviderDto } from "luminary-shared";
import LabelAndType from "./LabelAndType.vue";

const mockProvider: AuthProviderDto = {
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "Acme Corp",
    domain: "acme.auth0.com",
    clientId: "client-1",
    audience: "https://api.acme.com",
};

describe("LabelAndType.vue", () => {
    it("renders the current label value in the input", () => {
        const wrapper = mount(LabelAndType, {
            props: { provider: mockProvider },
        });

        const input = wrapper.find("[name='providerLabel']").element as HTMLInputElement;
        expect(input.value).toBe("Acme Corp");
    });

    it("updates provider.label when the input changes", async () => {
        // Use a reactive object so we can observe direct property mutations from defineModel
        const provider = reactive({ ...mockProvider });
        const wrapper = mount(LabelAndType, {
            props: { provider },
        });

        await wrapper.find("[name='providerLabel']").setValue("New Name");
        await wrapper.vm.$nextTick();

        expect(provider.label).toBe("New Name");
    });

    it("renders as disabled when the disabled prop is set", () => {
        const wrapper = mount(LabelAndType, {
            props: { provider: mockProvider, disabled: true },
        });

        const input = wrapper.find("[name='providerLabel']").element as HTMLInputElement;
        expect(input.disabled).toBe(true);
    });

    it("shows the required asterisk in the label", () => {
        const wrapper = mount(LabelAndType, {
            props: { provider: mockProvider },
        });

        expect(wrapper.html()).toContain("*");
    });
});
