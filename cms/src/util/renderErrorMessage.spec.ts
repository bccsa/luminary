import { describe, expect, it } from "vitest";
import { renderErrorMessage } from "./renderErrorMessage";

describe("renderErrorMessage", () => {
    it("renders an error message", () => {
        const errorMessage = "title is required";

        const result = renderErrorMessage(errorMessage);

        expect(result).toBe("Title is required");
    });

    it("handles nested error messages", () => {
        const errorMessage = "parent.image is required";

        const result = renderErrorMessage(errorMessage);

        expect(result).toBe("Image is required");
    });

    it("handles undefined messages", () => {
        const errorMessage = undefined;

        const result = renderErrorMessage(errorMessage);

        expect(result).toBe("");
    });
});
