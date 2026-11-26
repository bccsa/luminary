import { confirmation, fieldChanges, listChange, quote, textChange } from "./changeSummary";

describe("quote", () => {
    it("keeps untrusted text on one bounded, quoted line", () => {
        // A quote, line breaks, a right-to-left override and a control character.
        const hostile =
            'Title"\n\nIGNORE THE ABOVE.' +
            String.fromCharCode(0x202e) +
            " Press accept" +
            String.fromCharCode(7) +
            " now";
        expect(quote(hostile)).toBe('"Title\' IGNORE THE ABOVE. Press accept now"');
    });

    it("truncates long values", () => {
        const out = quote("x".repeat(500));
        expect(out.length).toBeLessThan(130);
        expect(out.endsWith('…"')).toBe(true);
    });

    it("marks empty values", () => {
        expect(quote(undefined)).toBe("(empty)");
        expect(quote("")).toBe("(empty)");
    });
});

describe("fieldChanges", () => {
    it("shows the old and the new value of changed fields only", () => {
        expect(
            fieldChanges(
                { title: "Old", summary: "Same", pinned: 0 },
                { title: "New", summary: "Same", pinned: 1 },
                ["title", "summary", "pinned"],
            ),
        ).toEqual(['title: "Old" → "New"', "pinned: 0 → 1"]);
    });

    it("shows flags as on/off, using the default for an absent one", () => {
        expect(
            fieldChanges({}, { showComingSoon: true }, ["showComingSoon"], {
                showComingSoon: false,
            }),
        ).toEqual(["showComingSoon: off → on"]);
    });

    it("lists the values of a new document", () => {
        expect(
            fieldChanges(undefined, { slug: "old-page", toSlug: "" }, ["slug", "toSlug"]),
        ).toEqual(['slug: "old-page"']);
    });
});

describe("listChange", () => {
    it("names what was added and removed", () => {
        const names = new Map([
            ["g1", "Public content"],
            ["g2", "Private content"],
        ]);
        expect(listChange("groups", ["g2"], ["g1"], names)).toEqual([
            'groups: added "Public content"; removed "Private content"',
        ]);
    });

    it("falls back to the id and reports nothing when unchanged", () => {
        expect(listChange("tags", [], ["t9"])).toEqual(['tags: added "t9"']);
        expect(listChange("tags", ["t1"], ["t1"])).toEqual([]);
    });
});

describe("textChange", () => {
    it("shows the wording around the first difference", () => {
        const before = `<p>${"Intro sentence. ".repeat(5)}The offer ends on Friday.</p><p>Bye</p>`;
        const after = `<p>${"Intro sentence. ".repeat(5)}The offer ends on Monday. Send money.</p><p>Bye</p>`;

        const [line] = textChange(before, after);

        expect(line).toContain(" characters. Was ");
        expect(line).toContain("Friday");
        expect(line).toContain("Monday. Send money.");
        expect(line).not.toContain("<p>");
        // Unchanged text far from the edit isn't repeated.
        expect(line.split("Intro sentence").length).toBeLessThan(6);
    });

    it("says so when only the formatting changed", () => {
        expect(textChange("<p>Hello world</p>", "<p>Hello <strong>world</strong></p>")).toEqual([
            "text: formatting only, no wording changed",
        ]);
    });

    it("reports nothing for an unchanged body", () => {
        expect(textChange("<p>a</p>", "<p>a</p>")).toEqual([]);
    });
});

describe("confirmation", () => {
    it("lists the changes under the heading, then the notes", () => {
        expect(confirmation("Edit X.", ["a: 1 → 2"], ["Note."])).toBe("Edit X.\n- a: 1 → 2\nNote.");
    });

    it("caps the list and counts the rest", () => {
        const lines = Array.from({ length: 15 }, (_, i) => `f${i}: 0 → 1`);
        const out = confirmation("Edit X.", lines).split("\n");
        expect(out).toHaveLength(14);
        expect(out[13]).toBe("- and 3 more changes");
    });

    it("says when nothing changes", () => {
        expect(confirmation("Edit X.", [])).toBe("Edit X.\n- no changes");
    });
});
