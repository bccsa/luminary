import { describe, it, expect, afterEach } from "vitest";
import type { ContentDto } from "luminary-shared";
import {
    captureSsrArticleTextSnapshot,
    recoverSsrArticleText,
    takeSsrArticleTextSnapshot,
} from "./ssrTextRecovery";

const baseDoc = { _id: "content-1", title: "Title" } as ContentDto;

afterEach(() => {
    // The snapshot lives on globalThis; clear it between tests so order doesn't matter.
    takeSsrArticleTextSnapshot();
    document.body.innerHTML = "";
});

describe("captureSsrArticleTextSnapshot / takeSsrArticleTextSnapshot", () => {
    it("captures the prerendered marker's innerHTML and yields it once", () => {
        document.body.innerHTML = '<div data-ssr-article-text="true"><p>Hello</p></div>';
        captureSsrArticleTextSnapshot();
        expect(takeSsrArticleTextSnapshot()).toBe("<p>Hello</p>");
        // One-shot: a second take (e.g. a later remount) gets nothing.
        expect(takeSsrArticleTextSnapshot()).toBeUndefined();
    });

    it("yields undefined when the prerendered page has no article marker", () => {
        document.body.innerHTML = "<div>not an article page</div>";
        captureSsrArticleTextSnapshot();
        expect(takeSsrArticleTextSnapshot()).toBeUndefined();
    });

    it("yields undefined when capture was never called", () => {
        expect(takeSsrArticleTextSnapshot()).toBeUndefined();
    });
});

describe("recoverSsrArticleText", () => {
    it("returns undefined when there is no doc", () => {
        expect(recoverSsrArticleText(undefined, "<p>Hello</p>")).toBeUndefined();
    });

    it("returns undefined when the doc already carries text (warm client cache)", () => {
        const doc = { ...baseDoc, text: "<p>already here</p>" };
        expect(recoverSsrArticleText(doc, "<p>Hello</p>")).toBeUndefined();
    });

    it("returns undefined when text is genuinely empty, not stripped", () => {
        const doc = { ...baseDoc, text: "" };
        expect(recoverSsrArticleText(doc, "<p>Hello</p>")).toBeUndefined();
    });

    it("returns undefined when text is stripped but no snapshot was captured", () => {
        const doc = { ...baseDoc, text: undefined };
        expect(recoverSsrArticleText(doc, undefined)).toBeUndefined();
    });

    it("merges the snapshot into the doc when text is stripped", () => {
        const doc = { ...baseDoc, text: undefined };
        expect(recoverSsrArticleText(doc, "<p>Hello</p>")).toEqual({ ...baseDoc, text: "<p>Hello</p>" });
    });
});