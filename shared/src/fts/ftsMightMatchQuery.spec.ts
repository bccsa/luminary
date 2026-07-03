import { describe, it, expect } from "vitest";
import { DocType } from "../types";
import { ftsMightMatchQuery } from "./ftsMightMatchQuery";

describe("ftsMightMatchQuery", () => {
    it("requires every query word (>=3 chars) as a substring in match fields", () => {
        expect(
            ftsMightMatchQuery("john", DocType.User, {
                type: DocType.User,
                name: "John Doe",
            }),
        ).toBe(true);
        expect(
            ftsMightMatchQuery("john", DocType.User, {
                type: DocType.User,
                name: "Jane",
            }),
        ).toBe(false);
    });

    it("matches multi-word queries with AND across fields", () => {
        expect(
            ftsMightMatchQuery("john example", DocType.User, {
                type: DocType.User,
                name: "John",
                email: "john@example.com",
            }),
        ).toBe(true);
        expect(
            ftsMightMatchQuery("john example", DocType.User, {
                type: DocType.User,
                name: "John Doe",
                email: "other@test.com",
            }),
        ).toBe(false);
    });

    it("returns false for queries shorter than 3 chars per word", () => {
        expect(
            ftsMightMatchQuery("jo", DocType.User, {
                type: DocType.User,
                name: "John",
            }),
        ).toBe(false);
    });

    it("in non-strict content mode accepts any content doc", () => {
        expect(
            ftsMightMatchQuery("unrelated", DocType.Content, {
                type: DocType.Content,
                title: "Hello",
            }, { strict: false }),
        ).toBe(true);
    });
});
