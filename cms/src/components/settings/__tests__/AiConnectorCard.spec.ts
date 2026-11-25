import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import type { Ref } from "vue";
import * as shared from "luminary-shared";
import { accessMap, AclPermission, DocType, type AuthProviderDto } from "luminary-shared";
import { activeProviderId } from "@/auth";
import AiConnectorCard from "../AiConnectorCard.vue";

vi.mock("luminary-shared", async (importOriginal) => {
    const { ref } = await import("vue");
    const providers = ref([]);
    return {
        ...(await importOriginal<object>()),
        useSharedHybridQuery: () => providers,
        __providers: providers,
    };
});
vi.mock("@/auth", async () => {
    const { ref } = await import("vue");
    return { activeProviderId: ref("provider-1") };
});

const providers = (shared as unknown as { __providers: Ref<AuthProviderDto[]> }).__providers;

const provider = (mcp?: AuthProviderDto["mcp"]): AuthProviderDto => ({
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    domain: "test.auth0.com",
    clientId: "client-id-1",
    audience: "https://api.example.test",
    mcp,
});

describe("AiConnectorCard.vue", () => {
    beforeEach(() => {
        activeProviderId.value = "provider-1";
        accessMap.value = {};
    });

    it("is hidden when the user's provider has MCP off", () => {
        providers.value = [provider({ enabled: false, resourceUrl: "https://api/mcp/provider-1" })];
        expect(mount(AiConnectorCard).find("[data-test='ai-connector']").exists()).toBe(false);
    });

    it("shows the connector URL to a user with McpView", () => {
        providers.value = [provider({ enabled: true, resourceUrl: "https://api/mcp/provider-1" })];
        accessMap.value = {
            g1: { [DocType.Post]: { [AclPermission.McpView]: true } },
        } as any;

        const wrapper = mount(AiConnectorCard);

        expect(wrapper.find("[data-test='ai-connector-url']").text()).toBe(
            "https://api/mcp/provider-1",
        );
    });

    it("explains how to get access to a user without McpView", () => {
        providers.value = [provider({ enabled: true, resourceUrl: "https://api/mcp/provider-1" })];
        accessMap.value = {
            g1: { [DocType.Post]: { [AclPermission.CmsView]: true } },
        } as any;

        const wrapper = mount(AiConnectorCard);

        expect(wrapper.find("[data-test='ai-connector-url']").exists()).toBe(false);
        expect(wrapper.find("[data-test='ai-connector-no-access']").text()).toContain("McpView");
    });

    it("uses the provider the user is signed in with", () => {
        providers.value = [
            { ...provider({ enabled: true, resourceUrl: "https://api/mcp/other" }), _id: "other" },
        ];
        expect(mount(AiConnectorCard).find("[data-test='ai-connector']").exists()).toBe(false);
    });
});
