import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmBeforeLeavingModal from "./ConfirmBeforeLeavingModal.vue";
import { useRouter } from "vue-router";
import LDialog from "../common/LDialog.vue";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

const onBeforeRouteLeave = vi.hoisted(() =>
    vi.fn().mockImplementation(() => (cb: Function) => cb()),
);

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        createRouter: () => ({
            push: vi.fn(),
            beforeEach: vi.fn(),
            afterEach: vi.fn(),
        }),
        useRouter: () => ({
            push: vi.fn(),
        }),
        onBeforeRouteLeave,
    };
});

describe("ConfirmBeforeLeavingModal", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("prevents the user from leaving the current route if there are unsaved changes", async () => {
        const router = useRouter();
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: {
                isDirty: true,
            },
        });

        await router.push({ name: "home" });

        const callback = onBeforeRouteLeave.mock.calls[0][0];
        expect(callback()).toBe(false);

        const modal = wrapper.findComponent(LDialog);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(true);
        });
    });

    it("allows the user to change the route if there are no unsaved changes", async () => {
        const router = useRouter();
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: {
                isDirty: false,
            },
        });

        await router.push({ name: "home" });

        const callback = onBeforeRouteLeave.mock.calls[0][0];
        expect(callback()).toBe(true);

        const modal = wrapper.findComponent(LDialog);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(false);
        });
    });

    it("closes modal when 'Stay on page' (secondary action) is triggered", async () => {
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: {
                isDirty: true,
            },
        });

        // Trigger route leave to open modal
        const callback = onBeforeRouteLeave.mock.calls[0][0];
        callback({ name: "home" });

        const modal = wrapper.findComponent(LDialog);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(true);
        });

        // Call secondary action (Stay on page)
        const secondaryAction = modal.props().secondaryAction as Function;
        secondaryAction();

        await waitForExpect(() => {
            expect(modal.props().open).toBe(false);
        });
    });

    it("navigates away when 'Discard changes' (primary action) is triggered", async () => {
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: {
                isDirty: true,
            },
        });

        // Trigger route leave to open modal
        const callback = onBeforeRouteLeave.mock.calls[0][0];
        callback({ name: "destination" });

        const modal = wrapper.findComponent(LDialog);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(true);
        });

        // Call primary action (Discard changes)
        const primaryAction = modal.props().primaryAction as Function;
        await primaryAction();

        await waitForExpect(() => {
            expect(modal.props().open).toBe(false);
        });
    });

    it("shows correct dialog text", () => {
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: { isDirty: false },
        });

        const modal = wrapper.findComponent(LDialog);
        expect(modal.props().title).toBe("Are you sure you want to leave the page?");
        expect(modal.props().primaryButtonText).toBe("Discard changes");
        expect(modal.props().secondaryButtonText).toBe("Stay on page");
        expect(modal.props().context).toBe("danger");
    });
});
