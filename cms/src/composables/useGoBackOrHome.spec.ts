import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouter } from "vue-router";
import { useGoBackOrHome } from "./useGoBackOrHome";

const mockBack = vi.fn();
const mockPush = vi.fn();

vi.mock("vue-router", () => ({
    useRouter: vi.fn(),
}));

describe("useGoBackOrHome", () => {
    beforeEach(() => {
        mockBack.mockClear();
        mockPush.mockClear();
    });

    it("calls router.back when history has a prior entry", () => {
        vi.mocked(useRouter).mockReturnValue({ back: mockBack, push: mockPush } as any);
        vi.stubGlobal("history", { length: 2 });

        useGoBackOrHome()();

        expect(mockBack).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("navigates to the dashboard when there is no history to go back to", () => {
        vi.mocked(useRouter).mockReturnValue({ back: mockBack, push: mockPush } as any);
        vi.stubGlobal("history", { length: 1 });

        useGoBackOrHome()();

        expect(mockBack).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith({ name: "dashboard" });
    });
});
