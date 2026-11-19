import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PrivacyPolicyModal from "./PrivacyPolicyModal.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { userPreferencesAsRef, appLanguageIdsAsRef } from "@/globalConfig";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db, type ContentDto } from "luminary-shared";
import * as auth from "@/auth";
import * as contentQuery from "@/composables/useContentQuery";
import { ref } from "vue";
import { hasPendingLogin } from "@/composables/useAuthWithPrivacyPolicy";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import { isAuthPluginInstalled } from "@/auth";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-router", () => ({
    useRouter: vi.fn(() => ({
        push: vi.fn(),
    })),
    useRoute: vi.fn(() => ({
        query: {},
    })),
}));

describe("PrivacyPolicyModal.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        userPreferencesAsRef.value.privacyPolicy = undefined;

        await db.docs.bulkPut([mockEnglishContentDto]);

        // Reset hasPendingLogin before each test
        hasPendingLogin.value = false;

        // Tests mock useAuth; pretend the plugin is installed so the
        // component actually calls it instead of short-circuiting.
        isAuthPluginInstalled.value = true;
    });
    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        db.docs.clear();
        isAuthPluginInstalled.value = false;
    });

    it.each(["modal", "banner"])(
        "preserves accepted consent when %s logout is refused",
        async (entry) => {
            const querySpy = vi
                .spyOn(contentQuery, "useContentQuery")
                .mockReturnValue(ref([{ ...mockEnglishContentDto, publishDate: 2000 }]) as any);
            userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: 1000 };
            const logout = vi.fn(async () => false);
            vi.mocked(auth.useAuth).mockReturnValue({ isAuthenticated: ref(true), logout } as any);
            if (entry === "banner") vi.useFakeTimers();
            const wrapper = mount(PrivacyPolicyModal, { props: { show: true } });
            if (entry === "modal") {
                const label =
                    mockLanguageDtoEng.translations["privacy_policy.modal.button_logOut"] ||
                    "privacy_policy.modal.button_logOut";
                await wrapper
                    .findAll("button")
                    .find((button) => button.text() === label)!
                    .trigger("click");
                await flushPromises();
            } else {
                await vi.advanceTimersByTimeAsync(2100);
                const notification = vi
                    .mocked(useNotificationStore().addNotification)
                    .mock.calls.map(([value]) => value)
                    .find((value) => value.id === "privacy-policy-banner")!;
                const actions = (notification.actions as Function)();
                await actions.children
                    .find((child: any) => child?.props?.name === "deny")
                    .props.onClick();
            }
            expect(logout).toHaveBeenCalledTimes(1);
            expect(userPreferencesAsRef.value.privacyPolicy).toEqual({
                status: "accepted",
                ts: 1000,
            });
            expect(useNotificationStore().removeNotification).not.toHaveBeenCalledWith(
                "privacy-policy-banner",
            );
            querySpy.mockRestore();
            vi.useRealTimers();
        },
    );

    it("revokes consent only after logout authorizes the signout", async () => {
        const querySpy = vi
            .spyOn(contentQuery, "useContentQuery")
            .mockReturnValue(ref([{ ...mockEnglishContentDto, publishDate: 2000 }]) as any);
        userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: 1000 };
        const logout = vi.fn(async (options) => {
            options.onBeforeSignout();
            return true;
        });
        vi.mocked(auth.useAuth).mockReturnValue({ isAuthenticated: ref(true), logout } as any);
        const wrapper = mount(PrivacyPolicyModal, { props: { show: true } });
        const label =
            mockLanguageDtoEng.translations["privacy_policy.modal.button_logOut"] ||
            "privacy_policy.modal.button_logOut";
        await wrapper
            .findAll("button")
            .find((button) => button.text() === label)!
            .trigger("click");
        await flushPromises();
        expect(userPreferencesAsRef.value.privacyPolicy).toBeUndefined();
        querySpy.mockRestore();
    });

    it("shows the privacy notification", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        expect(wrapper.html()).toContain(
            "Please accept our privacy policy for a fully featured app experience",
        );

        expect(userPreferencesAsRef.value.privacyPolicy).toBe(undefined);
    });

    it("can accept the privacy policy", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });
        await wrapper.find("button[name='accept']").trigger("click");

        expect(userPreferencesAsRef.value.privacyPolicy?.status).toBe("accepted");
    });

    it("handles necessaryOnly logic when authenticated", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(true),
        });

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        expect(wrapper.find("button[name='necessary-only']").exists()).toBe(false);
    });

    it("shows another message when the privacy policy has been accepted", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(true),
        });

        userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: Date.now() };

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        expect(wrapper.html()).toContain("You have already accepted the privacy policy");
        expect(wrapper.find("button[name='accept']").exists()).toBe(false);
    });

    it("shows another message when the privacy policy has been declined", async () => {
        // Simulate declined state by setting privacyPolicy to undefined
        userPreferencesAsRef.value.privacyPolicy = undefined;
        localStorage.setItem("userPreferences", JSON.stringify({}));

        const wrapper = mount(PrivacyPolicyModal, {
            props: { show: true },
        });

        // Expect the unaccepted message, as privacyPolicy is undefined
        expect(wrapper.html()).toContain(
            "Please accept our privacy policy for a fully featured app experience",
        );
    });

    it("can close the modal", async () => {
        userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: Date.now() };

        const wrapper = mount(PrivacyPolicyModal, {
            props: { show: true },
        });

        // Verify modal is visible
        expect(wrapper.html()).toContain("Privacy Policy");

        // Trigger the close event on LModal
        await wrapper.findComponent({ name: "LModal" }).vm.$emit("close");

        // Update props to reflect show=false
        await wrapper.setProps({ show: false });

        // Verify modal is no longer visible
        expect(wrapper.html()).not.toContain("Privacy Policy");
    });

    it("shows the privacy policy as outdated when the policy is updated", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(true),
            logout: vi.fn(),
        });

        // The component reads VITE_PRIVACY_POLICY_ID at setup time to build its
        // query. Locally this comes from .env, but CI has no .env, leaving it
        // undefined — which makes the query short-circuit to match nothing and
        // the policy never reads as "outdated". Stub it so the test is
        // self-sufficient regardless of environment.
        vi.stubEnv("VITE_PRIVACY_POLICY_ID", "page-privacy-policy");

        await db.docs.clear();
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "mock-privacy-policy-id",
                parentId: import.meta.env.VITE_PRIVACY_POLICY_ID,
                language: "lang-eng",
                // Must be a fixed past date, NOT Date.now(): mangoIsPublished filters on
                // the frozen sessionNow() (captured once per run), so a publishDate after
                // that bound is filtered out and the query returns nothing. This value is
                // after the acceptance ts below (so the policy reads as "outdated") but
                // safely before sessionNow().
                publishDate: 1704114000000, // 2024-01-01
            } as ContentDto,
        ]);

        userPreferencesAsRef.value.privacyPolicy = {
            status: "accepted",
            ts: 1000004000000, // 2001-09-08 — before the policy's publishDate above
        };

        // Resolve a display language so useContentQuery's language clause matches
        // the doc above — with no display language the query is provably empty
        // (`{ language: { $in: [] } }`) and the policy never resolves as "outdated".
        const prevLanguageIds = appLanguageIdsAsRef.value;
        appLanguageIdsAsRef.value = ["lang-eng"];

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(
                "We have updated our privacy policy. Please accept it for a fully featured app experience",
            );
        });

        // Verify that the "Accept" button is visible
        expect(wrapper.find("button[name='accept']").exists()).toBe(true);

        appLanguageIdsAsRef.value = prevLanguageIds;
    });

    it("hides 'Necessary Only' button when there is a pending login", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        // Simulate a pending login
        hasPendingLogin.value = true;
        userPreferencesAsRef.value.privacyPolicy = undefined;

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        // Necessary Only button should not be shown when there's a pending login
        expect(wrapper.find("button[name='necessary-only']").exists()).toBe(false);

        // Accept button should still be visible
        expect(wrapper.find("button[name='accept']").exists()).toBe(true);
    });

    it("can click 'Necessary Only' to set status", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        hasPendingLogin.value = false;
        userPreferencesAsRef.value.privacyPolicy = undefined;

        const wrapper = mount(PrivacyPolicyModal, {
            props: { show: true },
        });

        await wrapper.find("button[name='necessary-only']").trigger("click");
        expect((userPreferencesAsRef.value.privacyPolicy as any)?.status).toBe("necessaryOnly");
    });

    it("navigates to privacy-policy content on 'More Info' click", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        userPreferencesAsRef.value.privacyPolicy = undefined;

        const wrapper = mount(PrivacyPolicyModal, {
            props: { show: true },
        });

        const moreInfoButton = wrapper.find("button[name='more-info']");
        expect(moreInfoButton.exists()).toBe(true);
        await moreInfoButton.trigger("click");
        // Router mock handles the push
    });

    it("adds banner notification after 2 second delay", async () => {
        vi.useFakeTimers();

        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
            logout: vi.fn(),
        });

        userPreferencesAsRef.value.privacyPolicy = undefined;

        mount(PrivacyPolicyModal, {
            props: { show: false },
        });

        // Advance past the 2-second setTimeout
        await vi.advanceTimersByTimeAsync(2100);

        const notificationStore = useNotificationStore();
        expect(notificationStore.addNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "privacy-policy-banner",
                type: "bottom",
                state: "info",
            }),
        );

        vi.useRealTimers();
    });

    it("removes banner notification when status becomes accepted", async () => {
        vi.useFakeTimers();

        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
            logout: vi.fn(),
        });

        userPreferencesAsRef.value.privacyPolicy = undefined;

        mount(PrivacyPolicyModal, {
            props: { show: false },
        });

        // Advance past setTimeout
        await vi.advanceTimersByTimeAsync(2100);

        // Now accept the policy
        userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: Date.now() };

        // The watch should fire and call removeNotification
        await vi.advanceTimersByTimeAsync(100);

        const notificationStore = useNotificationStore();
        expect(notificationStore.removeNotification).toHaveBeenCalledWith("privacy-policy-banner");

        vi.useRealTimers();
    });

    it("shows necessaryOnly status in modal message", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
            logout: vi.fn(),
        });

        userPreferencesAsRef.value.privacyPolicy = { status: "necessaryOnly", ts: Date.now() };

        const wrapper = mount(PrivacyPolicyModal, {
            props: { show: true },
        });

        // The modal should show the necessaryOnly message
        expect(wrapper.html()).toContain("privacy_policy.banner.message_map.necessaryOnly");
    });

    it("shows 'Necessary Only' button when there is no pending login", async () => {
        (auth as any).useAuth.mockReturnValue({
            isAuthenticated: ref(false),
        });

        // No pending login
        hasPendingLogin.value = false;
        userPreferencesAsRef.value.privacyPolicy = undefined;

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        // Necessary Only button should be shown when there's no pending login and user is not authenticated
        expect(wrapper.find("button[name='necessary-only']").exists()).toBe(true);

        // Accept button should also be visible
        expect(wrapper.find("button[name='accept']").exists()).toBe(true);
    });
});
