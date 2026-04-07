import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import NotFoundPage from "./NotFoundPage.vue";
import { ref } from "vue";

const isAuthenticatedRef = ref(false);
const loginWithRedirectMock = vi.fn();

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/composables/useAuthWithPrivacyPolicy", () => ({
    useAuthWithPrivacyPolicy: () => ({
        isAuthenticated: isAuthenticatedRef,
        loginWithRedirect: loginWithRedirectMock,
    }),
}));

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        RouterLink: { template: "<a><slot /></a>", props: ["to"] },
    };
});

describe("NotFoundPage", () => {
    beforeEach(() => {
        isAuthenticatedRef.value = false;
        loginWithRedirectMock.mockClear();
    });

    it("shows unauthenticated title and description when not authenticated", () => {
        const wrapper = mount(NotFoundPage);

        expect(wrapper.text()).toContain("notfoundpage.unauthenticated.title");
        expect(wrapper.text()).toContain("notfoundpage.unauthenticated.description");
    });

    it("shows authenticated title, description, and home link when authenticated", async () => {
        isAuthenticatedRef.value = true;

        const wrapper = mount(NotFoundPage);

        expect(wrapper.text()).toContain("notfoundpage.authenticated.title");
        expect(wrapper.text()).toContain("notfoundpage.authenticated.description");
        expect(wrapper.text()).toContain("notfoundpage.navigation.home");
    });

    it("calls loginWithRedirect when login link is clicked", async () => {
        const wrapper = mount(NotFoundPage);

        const loginLink = wrapper.find("span.cursor-pointer");
        await loginLink.trigger("click");

        expect(loginWithRedirectMock).toHaveBeenCalled();
    });

    it("shows RouterLink to home when authenticated", () => {
        isAuthenticatedRef.value = true;

        const wrapper = mount(NotFoundPage);

        const link = wrapper.find("a");
        expect(link.exists()).toBe(true);
        expect(wrapper.text()).toContain("notfoundpage.navigation.home");
    });
});
