import "reflect-metadata";
import processPostTagDto from "./processPostTagDto";
import processContentDto from "./processContentDto";
import { DbService } from "../../db/db.service";
import { ContentDto } from "../../dto/ContentDto";
import { PostDto } from "../../dto/PostDto";
import { DocType, PublishStatus } from "../../enums";

jest.mock("../validateSlug", () => ({
    validateSlug: jest.fn(async (slug: string) => slug),
}));

const clone = <T>(d: T): T => JSON.parse(JSON.stringify(d));

/**
 * In-memory stand-in for CouchDB. `afterSnapshot` runs right after a request has read
 * the translations of a post, standing in for another save that commits while that
 * request is still busy.
 */
function memoryDb(docs: Array<{ _id: string }>, afterSnapshot: (store: Map<string, any>) => void) {
    const store = new Map<string, any>(docs.map((d) => [d._id, clone(d)]));
    let interleaved = false;
    const db = {
        getDoc: jest.fn(async (id: string) => ({
            docs: store.has(id) ? [clone(store.get(id))] : [],
        })),
        getContentByParentId: jest.fn(async (parentId: string) => {
            const snapshot = [...store.values()]
                .filter((d) => d.type === DocType.Content && d.parentId === parentId)
                .map(clone);
            if (!interleaved) {
                interleaved = true;
                afterSnapshot(store);
            }
            return { docs: snapshot };
        }),
        upsertDoc: jest.fn(async (doc: any) => {
            store.set(doc._id, clone(doc));
            return { ok: true, id: doc._id };
        }),
        checkUniqueSlug: jest.fn(async () => true),
    } as unknown as DbService;
    return { db, store };
}

const post = (): PostDto =>
    ({
        _id: "post-1",
        type: DocType.Post,
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
    }) as PostDto;

const translation = (language: string, title: string, available: string[]): ContentDto =>
    ({
        _id: `content-${language}`,
        type: DocType.Content,
        parentId: "post-1",
        language,
        status: PublishStatus.Published,
        slug: `slug-${language}`,
        title,
        publishDate: 1,
        availableTranslations: available,
    }) as ContentDto;

describe("cascades onto translations during overlapping saves", () => {
    it("a parent save keeps the availableTranslations another save just wrote", async () => {
        // The French doc predates the English translation; while the post is being saved,
        // publishing the English translation adds lang-eng to the French doc's list.
        const { db, store } = memoryDb(
            [post(), translation("lang-fra", "Réunion", ["lang-fra"])],
            (s) => {
                s.get("content-lang-fra").availableTranslations = ["lang-fra", "lang-eng"];
            },
        );
        const saved = { ...post(), publishDateVisible: false };

        await processPostTagDto(saved, post(), db);

        const fra = store.get("content-lang-fra");
        expect(fra.availableTranslations).toEqual(["lang-fra", "lang-eng"]);
        expect(fra.parentPublishDateVisible).toBe(false);
    });

    it("a translation save keeps a sibling's own edits made meanwhile", async () => {
        const { db, store } = memoryDb(
            [post(), translation("lang-fra", "Réunion", ["lang-fra"])],
            (s) => {
                s.get("content-lang-fra").title = "Réunion des jeunes";
            },
        );

        await processContentDto(translation("lang-eng", "Youth meeting", []), db);

        const fra = store.get("content-lang-fra");
        expect(fra.title).toBe("Réunion des jeunes");
        expect(fra.availableTranslations).toEqual(["lang-fra", "lang-eng"]);
    });
});
