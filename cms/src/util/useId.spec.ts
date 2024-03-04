import { describe, it, expect } from "vitest";
import { useId } from "./useId";

describe("useId", () => {
    it("returns a new id", () => {
        const id = useId();
        const id2 = useId();

        expect(id).toBe(1);
        expect(id2).toBe(2);
    });
});
