import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ContentDto } from "luminary-shared";

// A plain box rather than a ref: each test sets it before calling the composable, so the
// computeds never need to re-evaluate.
const { docs } = vi.hoisted(() => ({ docs: { value: [] as Partial<ContentDto>[] } }));
vi.mock("@/composables/useContentQuery", () => ({ useContentQuery: () => docs }));

import { useGlobalCopyright } from "./useGlobalCopyright";

describe("useGlobalCopyright", () => {
    beforeEach(() => {
        docs.value = [];
    });

    it("is empty when no copyright page is published", () => {
        const { copyrightHtml, copyrightText } = useGlobalCopyright();

        expect(copyrightHtml.value).toBe("");
        expect(copyrightText.value).toBe("");
    });

    it("exposes the notice as HTML for the banner and as plain text for shares", () => {
        docs.value = [{ text: "<p>© 2026 Luminary. <b>All rights reserved.</b></p><p>More.</p>" }];

        const { copyrightHtml, copyrightText } = useGlobalCopyright();

        expect(copyrightHtml.value).toContain("<b>All rights reserved.</b>");
        expect(copyrightText.value).toBe("© 2026 Luminary. All rights reserved.");
    });
});
