import { describe, it, expect, vi } from "vitest";
import type { ContentDto } from "luminary-shared";
import { recoverSsrArticleText } from "./ssrTextRecovery";

const baseDoc = { _id: "content-1", title: "Title" } as ContentDto;

describe("recoverSsrArticleText", () => {
    it("returns undefined when there is no doc", () => {
        const querySelector = vi.fn();
        expect(recoverSsrArticleText(undefined, querySelector)).toBeUndefined();
        expect(querySelector).not.toHaveBeenCalled();
    });

    it("returns undefined when the doc already carries text (warm client cache)", () => {
        const doc = { ...baseDoc, text: "<p>already here</p>" };
        const querySelector = vi.fn();
        expect(recoverSsrArticleText(doc, querySelector)).toBeUndefined();
        expect(querySelector).not.toHaveBeenCalled();
    });

    it("returns undefined when text is genuinely empty, not stripped", () => {
        const doc = { ...baseDoc, text: "" };
        const querySelector = vi.fn();
        expect(recoverSsrArticleText(doc, querySelector)).toBeUndefined();
        expect(querySelector).not.toHaveBeenCalled();
    });

    it("returns undefined when text is stripped but no matching DOM node exists", () => {
        const doc = { ...baseDoc, text: undefined };
        const querySelector = vi.fn().mockReturnValue(null);
        expect(recoverSsrArticleText(doc, querySelector)).toBeUndefined();
        expect(querySelector).toHaveBeenCalledWith("[data-ssr-article-text]");
    });

    it("merges the DOM node's innerHTML into the doc when text is stripped", () => {
        const doc = { ...baseDoc, text: undefined };
        const querySelector = vi.fn().mockReturnValue({ innerHTML: "<p>Hello</p>" });
        const recovered = recoverSsrArticleText(doc, querySelector);
        expect(recovered).toEqual({ ...baseDoc, text: "<p>Hello</p>" });
    });
});
