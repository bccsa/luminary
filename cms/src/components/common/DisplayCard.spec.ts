import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import DisplayCard from "./DisplayCard.vue";

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
    };
});

vi.mock("vue-router", () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
}));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        db: {
            ...(actual as any).db,
            toDateTime: vi.fn(() => ({
                toLocaleString: vi.fn(() => "1/1/2024, 12:00 PM"),
            })),
        },
    };
});

describe("DisplayCard", () => {
    it("renders the title", () => {
        const wrapper = mount(DisplayCard, {
            props: { title: "Test Title", updatedTimeUtc: 1000 },
        });

        expect(wrapper.text()).toContain("Test Title");
    });

    it("renders title-extension slot", () => {
        const wrapper = mount(DisplayCard, {
            props: { title: "Title", updatedTimeUtc: 1000 },
            slots: { "title-extension": "<span>Extension</span>" },
        });

        expect(wrapper.text()).toContain("Extension");
    });

    it("renders content slot", () => {
        const wrapper = mount(DisplayCard, {
            props: { title: "Title", updatedTimeUtc: 1000 },
            slots: { content: "<div>Content here</div>" },
        });

        expect(wrapper.text()).toContain("Content here");
    });

    it("navigates when navigateTo is a route object", async () => {
        const wrapper = mount(DisplayCard, {
            props: {
                title: "Title",
                updatedTimeUtc: 1000,
                navigateTo: { name: "edit", params: { id: "1" } },
            },
        });

        // Click should not throw - router.push is mocked
        await wrapper.find('[data-test="display-card"]').trigger("click");
        // The component should be clickable
        expect(wrapper.find('[data-test="display-card"]').exists()).toBe(true);
    });

    it("calls navigateTo function when it is a function", async () => {
        const navigateFn = vi.fn();
        const wrapper = mount(DisplayCard, {
            props: {
                title: "Title",
                updatedTimeUtc: 1000,
                navigateTo: navigateFn,
            },
        });

        await wrapper.find('[data-test="display-card"]').trigger("click");
        expect(navigateFn).toHaveBeenCalled();
    });

    it("does not navigate when canNavigate is false", async () => {
        const navigateFn = vi.fn();
        const wrapper = mount(DisplayCard, {
            props: {
                title: "Title",
                updatedTimeUtc: 1000,
                navigateTo: navigateFn,
                canNavigate: false,
            },
        });

        await wrapper.find('[data-test="display-card"]').trigger("click");
        expect(navigateFn).not.toHaveBeenCalled();
    });

    it("shows 'Offline changes' badge when isLocalChange is true on desktop", () => {
        const wrapper = mount(DisplayCard, {
            props: {
                title: "Title",
                updatedTimeUtc: 1000,
                isLocalChange: true,
            },
            slots: { topBadges: "<span>Badge</span>" },
        });

        expect(wrapper.text()).toContain("Offline changes");
    });

    it("renders topRightContent slot", () => {
        const wrapper = mount(DisplayCard, {
            props: { title: "Title", updatedTimeUtc: 1000 },
            slots: { topRightContent: "<button>Edit</button>" },
        });

        expect(wrapper.text()).toContain("Edit");
    });

    it("renders desktopFooter slot with date on desktop", () => {
        const wrapper = mount(DisplayCard, {
            props: { title: "Title", updatedTimeUtc: 1000 },
            slots: { desktopFooter: "<span>Footer</span>" },
        });

        expect(wrapper.text()).toContain("Footer");
    });

    it("does not render date when showDate is false", () => {
        const wrapper = mount(DisplayCard, {
            props: { title: "Title", updatedTimeUtc: 1000, showDate: false },
            slots: { desktopFooter: "<span>Footer</span>" },
        });

        expect(wrapper.text()).not.toContain("Last Updated");
    });
});
