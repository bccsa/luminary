import { describe, it, expect, afterEach } from "vitest";
import type { ContentDto } from "luminary-shared";
import {
    captureSsgArticleTextSnapshot,
    recoverSsgArticleText,
    takeSsgArticleTextSnapshot,
} from "./ssgTextRecovery";

const baseDoc = { _id: "content-1", title: "Title" } as ContentDto;

afterEach(() => {
    // The snapshot lives on globalThis; clear it between tests so order doesn't matter.
    takeSsgArticleTextSnapshot();
    document.body.innerHTML = "";
});

describe("captureSsgArticleTextSnapshot / takeSsgArticleTextSnapshot", () => {
    it("captures the prerendered marker's innerHTML and yields it once", () => {
        document.body.innerHTML = '<div data-ssg-article-text="true"><p>Hello</p></div>';
        captureSsgArticleTextSnapshot();
        expect(takeSsgArticleTextSnapshot()).toBe("<p>Hello</p>");
        // One-shot: a second take (e.g. a later remount) gets nothing.
        expect(takeSsgArticleTextSnapshot()).toBeUndefined();
    });

    it("yields undefined when the prerendered page has no article marker", () => {
        document.body.innerHTML = "<div>not an article page</div>";
        captureSsgArticleTextSnapshot();
        expect(takeSsgArticleTextSnapshot()).toBeUndefined();
    });

    it("yields undefined when capture was never called", () => {
        expect(takeSsgArticleTextSnapshot()).toBeUndefined();
    });
});

describe("recoverSsgArticleText", () => {
    it("returns undefined when there is no doc", () => {
        expect(recoverSsgArticleText(undefined, "<p>Hello</p>")).toBeUndefined();
    });

    it("returns undefined when the doc already carries text (warm client cache)", () => {
        const doc = { ...baseDoc, text: "<p>already here</p>" };
        expect(recoverSsgArticleText(doc, "<p>Hello</p>")).toBeUndefined();
    });

    it("returns undefined when text is genuinely empty, not stripped", () => {
        const doc = { ...baseDoc, text: "" };
        expect(recoverSsgArticleText(doc, "<p>Hello</p>")).toBeUndefined();
    });

    it("returns undefined when text is stripped but no snapshot was captured", () => {
        const doc = { ...baseDoc, text: undefined };
        expect(recoverSsgArticleText(doc, undefined)).toBeUndefined();
    });

    it("merges the snapshot into the doc when text is stripped", () => {
        const doc = { ...baseDoc, text: undefined };
        expect(recoverSsgArticleText(doc, "<p>Hello</p>")).toEqual({
            ...baseDoc,
            text: "<p>Hello</p>",
        });
    });
});
