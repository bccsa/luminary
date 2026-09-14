import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBackNavigation } from "@/composables/useBackNavigation";

const routerMock = {
    back: vi.fn(),
    replace: vi.fn(),
    options: { history: { state: {} as { back?: string | null } } },
};

vi.mock("vue-router", () => ({ useRouter: () => routerMock }));

const click = () => {
    const event = { preventDefault: vi.fn() } as unknown as MouseEvent;
    useBackNavigation().onBackClick(event);
    return event;
};

describe("useBackNavigation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("goes back through history when the router has a previous entry", () => {
        routerMock.options.history.state = { back: "/explore" };

        const event = click();

        expect(event.preventDefault).toHaveBeenCalled();
        expect(routerMock.back).toHaveBeenCalledTimes(1);
        expect(routerMock.replace).not.toHaveBeenCalled();
    });

    it("replaces with home when the page was opened directly (no previous entry)", () => {
        routerMock.options.history.state = { back: null };

        click();

        expect(routerMock.back).not.toHaveBeenCalled();
        expect(routerMock.replace).toHaveBeenCalledWith({ name: "home" });
    });

    it("treats a missing history state as no previous entry", () => {
        routerMock.options.history.state = undefined as unknown as { back?: string | null };

        click();

        expect(routerMock.back).not.toHaveBeenCalled();
        expect(routerMock.replace).toHaveBeenCalledWith({ name: "home" });
    });

    it("exposes canGoBack for callers that need the same decision", () => {
        routerMock.options.history.state = { back: "/" };
        expect(useBackNavigation().canGoBack()).toBe(true);

        routerMock.options.history.state = { back: null };
        expect(useBackNavigation().canGoBack()).toBe(false);
    });
});
