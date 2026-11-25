import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { DocType, type AuthProviderDto } from "luminary-shared";
import McpConfig from "../McpConfig.vue";

vi.mock("@/globalConfig", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    apiUrl: "https://api.example.test/",
}));

const provider = (): AuthProviderDto => ({
    _id: "provider-1",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    domain: "test.auth0.com",
    clientId: "client-id-1",
    audience: "https://api.example.test",
});

function mountWith(p: AuthProviderDto) {
    return mount(McpConfig, {
        props: {
            provider: p,
            "onUpdate:provider": () => {},
        },
    });
}

describe("McpConfig.vue", () => {
    it("adds no mcp settings until MCP is switched on", () => {
        const p = provider();
        const wrapper = mountWith(p);

        expect(p.mcp).toBeUndefined();
        expect(wrapper.find("[name='mcp-resourceUrl']").exists()).toBe(false);
    });

    it("prefills the MCP URL and CMS URL when switched on", async () => {
        const p = provider();
        const wrapper = mountWith(p);

        await wrapper.find("[data-test='mcp-enabled']").trigger("click");

        expect(p.mcp).toEqual({
            enabled: true,
            resourceUrl: "https://api.example.test/mcp/provider-1",
            cmsUrl: window.location.origin,
        });
        expect((wrapper.find("[name='mcp-resourceUrl']").element as HTMLInputElement).value).toBe(
            "https://api.example.test/mcp/provider-1",
        );
    });

    it("keeps the settings but marks MCP off when switched off", async () => {
        const p = provider();
        p.mcp = { enabled: true, resourceUrl: "https://api.example.test/mcp/provider-1" };
        const wrapper = mountWith(p);

        await wrapper.find("[data-test='mcp-enabled']").trigger("click");

        expect(p.mcp).toEqual({
            enabled: false,
            resourceUrl: "https://api.example.test/mcp/provider-1",
        });
    });

    it("stores allowed client ids as a list, and none as undefined", async () => {
        const p = provider();
        p.mcp = { enabled: true, resourceUrl: "https://api.example.test/mcp/provider-1" };
        const wrapper = mountWith(p);

        await wrapper.find("[name='mcp-clientIds']").setValue("claude, chatgpt  other");
        expect(p.mcp.allowedClientIds).toEqual(["claude", "chatgpt", "other"]);

        await wrapper.find("[name='mcp-clientIds']").setValue("");
        expect(p.mcp.allowedClientIds).toBeUndefined();
    });
});
