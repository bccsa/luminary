import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { db, DocType, type AuthProviderDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import AuthProviderSelectionModal from "./AuthProviderSelectionModal.vue";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        // `te` is false throughout: the Kratos entry's copy has no translation
        // here, so it renders its English default.
        te: () => false,
        t: (key: string) =>
            (
                ({
                    "login.provider.button": "Sign in with Example Org",
                }) as Record<string, string>
            )[key] ?? key,
    }),
}));

vi.mock("@/auth", () => ({
    loginWithProvider: vi.fn(),
    showProviderSelectionModal: ref(true),
}));

// Whether the Kratos entry is offered depends on an environment variable, which
// would otherwise make these assertions depend on the developer's own .env.
const kratosEnabled = { value: false };
vi.mock("@/auth/kratos/client", () => ({
    isKratosEnabled: () => kratosEnabled.value,
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

const mockProviderKeyLabel: AuthProviderDto = {
    _id: "provider-key",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "login.provider.button",
    domain: "key.auth0.com",
    clientId: "client-key",
    audience: "https://api.key.com",
};

const mockProviderDisplayNameFallback: AuthProviderDto = {
    _id: "provider-display-name",
    type: DocType.AuthProvider,
    updatedTimeUtc: 1704114000000,
    memberOf: [],
    label: "",
    displayName: "Login with Display Name",
    domain: "display.auth0.com",
    clientId: "client-display",
    audience: "https://api.display.com",
};

describe("AuthProviderSelectionModal.vue", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        kratosEnabled.value = false;
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

        const providerBtn = wrapper.findAll("button").find((b) => b.text().includes("Acme Corp"));
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

        const providerBtn = wrapper.findAll("button").find((b) => b.text().includes("Beta Inc"));
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

    it("renders dotted i18n keys from labels through translation", async () => {
        await db.docs.put(mockProviderKeyLabel);

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Sign in with Example Org");
        });
    });

    it("falls back to displayName when label is empty", async () => {
        await db.docs.put(mockProviderDisplayNameFallback);

        const wrapper = mount(AuthProviderSelectionModal, {
            props: { isVisible: true },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Login with Display Name");
        });
    });

    describe("with the Kratos screens switched on", () => {
        beforeEach(() => {
            kratosEnabled.value = true;
        });

        it("offers the email entry alongside the configured providers", async () => {
            await db.docs.put(mockProviderA);

            const wrapper = mount(AuthProviderSelectionModal, {
                props: { isVisible: true },
            });

            await waitForExpect(() => {
                expect(wrapper.html()).toContain("Acme Corp");
                expect(wrapper.html()).toContain("Continue with email");
            });
        });

        it("is a method in its own right, so no empty state with no providers", async () => {
            const wrapper = mount(AuthProviderSelectionModal, {
                props: { isVisible: true },
            });

            await waitForExpect(() => {
                expect(wrapper.html()).toContain("Continue with email");
            });
            expect(wrapper.html()).not.toContain("auth.no_methods_available");
        });

        it("does not send the email entry through loginWithProvider", async () => {
            const wrapper = mount(AuthProviderSelectionModal, {
                props: { isVisible: true },
            });

            await waitForExpect(() => {
                expect(wrapper.html()).toContain("Continue with email");
            });
            const emailButton = wrapper
                .findAll("button")
                .find((button) => button.text().includes("Continue with email"));
            await emailButton!.trigger("click");

            // Kratos is not an OIDC provider; routing it through the OIDC client
            // would redirect to an /authorize endpoint that does not exist.
            expect(loginWithProvider).not.toHaveBeenCalled();
            expect(showProviderSelectionModal.value).toBe(false);
        });
    });
});
