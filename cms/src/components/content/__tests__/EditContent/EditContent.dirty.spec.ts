import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";

// Mocks must be declared in this file so they hoist above the EditContent import (per-file).
vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            currentRoute: {
                value: { name: "edit", params: { languageCode: "eng" } },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// @ts-expect-error
window.scrollTo = vi.fn();

import { mount } from "@vue/test-utils";
import { DocType, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import ConfirmBeforeLeavingModal from "@/components/modals/ConfirmBeforeLeavingModal.vue";
import waitForExpect from "wait-for-expect";
import { setupTestEnvironment, cleanupTestEnvironment, mockPostDto } from "./EditContent.test-utils";

// `isDirty` (surfaced via ConfirmBeforeLeavingModal's :isDirty prop) must return to clean when
// the user manually reverts an edit. Optional ContentDto fields (copyright, seoTitle, …) are
// absent on real docs; without normalization, typing then clearing them left the doc permanently
// dirty (editable {copyright:""} !== shadow {} under lodash deep-equal). Regression for that.
describe("EditContent - dirty state on manual revert", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    const isDirty = (wrapper: ReturnType<typeof mount>) =>
        wrapper.findComponent(ConfirmBeforeLeavingModal).props("isDirty");

    it("clears dirty when an absent optional field is typed then cleared", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find('[name="copyright"]').exists()).toBe(true);
        });

        // Baseline: the seeded content has no `copyright`, so it starts clean.
        expect(isDirty(wrapper)).toBe(false);

        const copyright = wrapper.find('[name="copyright"]');
        await copyright.setValue("© Someone");
        await waitForExpect(() => {
            expect(isDirty(wrapper)).toBe(true);
        });

        // Manually revert: clear the field back to empty. It should read clean again.
        await copyright.setValue("");
        await waitForExpect(() => {
            expect(isDirty(wrapper)).toBe(false);
        });
    });
});
