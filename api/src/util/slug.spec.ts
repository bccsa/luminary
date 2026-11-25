import { generateNonUniqueSlug } from "./slug";

describe("generateNonUniqueSlug", () => {
    it.each([
        ["Hello World", "hello-world"],
        ["  Tom & Jerry: The Movie!  ", "tom-and-jerry-the-movie"],
        // Same as the CMS: accented letters are dropped before transliteration
        ["Über café", "ber-caf"],
        ["snake_case title", "snake-case-title"],
        ["---", ""],
    ])("turns %j into %j", (title, slug) => {
        expect(generateNonUniqueSlug(title)).toBe(slug);
    });
});
