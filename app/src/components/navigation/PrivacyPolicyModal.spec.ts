import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import PrivacyPolicyModal from "./PrivacyPolicyModal.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { userPreferencesAsRef } from "@/globalConfig";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { db, type ContentDto } from "luminary-shared";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("PrivacyPolicyModal.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        await db.docs.bulkPut([mockEnglishContentDto]);
    });
    afterEach(() => {
        vi.clearAllMocks();
        db.docs.clear();
    });

    it("shows the privacy notification", async () => {
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

    it("can decline the privacy policy", async () => {
        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        await wrapper.find("button[name='decline']").trigger("click");

        expect(userPreferencesAsRef.value.privacyPolicy?.status).toBe("declined");
    });

    // it("shows another message when the privacy policy has been declined", async () => {
    //     userPreferencesAsRef.value.privacyPolicy = { status: "declined", ts: Date.now() };

    //     const wrapper = mount(PrivacyPolicyModal, {
    //         props: {
    //             show: true,
    //         },
    //     });

    //     expect(wrapper.html()).toContain(
    //         "You have previously declined the privacy policy. Please accept it for a fully featured app experience",
    //     );
    // });

    it("can accept the privacy policy", async () => {
        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });
        await wrapper.find("button[name='accept']").trigger("click");

        expect(userPreferencesAsRef.value.privacyPolicy?.status).toBe("accepted");
    });

    it("shows another message when the privacy policy has been accepted", async () => {
        userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: Date.now() };

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        expect(wrapper.html()).toContain("You have already accepted the privacy policy");
        expect(wrapper.find("button[name='accept']").exists()).toBe(false);
    });

    it("can close the modal", async () => {
        userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: Date.now() };

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        expect(wrapper.find("button[name='close']").exists()).toBe(true);

        await wrapper.find("button[name='close']").trigger("click");

        expect(wrapper.html()).not.toContain("Privacy Policy");
    });

    it.skip("shows the privacy policy as outdated when the policy is updated", async () => {
        await db.docs.bulkPut([
            {
                ...mockEnglishContentDto,
                _id: "mock-privacy-policy-id",
                parentId: import.meta.env.VITE_PRIVACY_POLICY_ID,
                language: "lang-eng",
                publishDate: Date.now(),
            } as ContentDto,
        ]);

        userPreferencesAsRef.value.privacyPolicy = {
            status: "accepted",
            ts: 0,
        };

        const wrapper = mount(PrivacyPolicyModal, {
            props: {
                show: true,
            },
        });

        expect(wrapper.html()).toContain(
            "We have updated our privacy policy. Please accept it for a fully featured app experience.",
        );

        // Verify that the "Accept" button is visible
        expect(wrapper.find("button[name='accept']").exists()).toBe(true);
    });
});
