import { DbService } from "../db/db.service";
import { ContentDto } from "../dto/ContentDto";
import { RedirectDto } from "../dto/RedirectDto";
import { AclPermission, DocType, PublishStatus, RedirectType } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { createSlugChangeRedirect, findSlugReversionRedirect } from "./createSlugChangeRedirect";

type MockDb = DbService & {
    checkUniqueSlug: jest.Mock;
    getDocsBySlug: jest.Mock;
    upsertDoc: jest.Mock;
};

const content = (overrides: Partial<ContentDto> = {}): ContentDto =>
    ({
        _id: "content-1",
        type: DocType.Content,
        memberOf: ["group-public-content"],
        parentId: "post-1",
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "new-slug",
        title: "Title",
        publishDate: Date.now() - 1000,
        parentTags: [],
        ...overrides,
    }) as ContentDto;

const db = (): MockDb =>
    ({
        checkUniqueSlug: jest.fn().mockResolvedValue(true),
        getDocsBySlug: jest.fn().mockResolvedValue([]),
        upsertDoc: jest.fn().mockResolvedValue({ ok: true }),
    }) as unknown as MockDb;

describe("createSlugChangeRedirect", () => {
    beforeEach(() => {
        jest.spyOn(PermissionSystem, "verifyAccess").mockReturnValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("creates a permanent redirect for a live published slug change", async () => {
        const mockDb = db();
        const res = await createSlugChangeRedirect(
            "user-1",
            content(),
            content({ slug: "old-slug" }),
            ["group-super-admins"],
            mockDb,
        );

        expect(res).toEqual({ info: 'Created a redirect from "old-slug" to "new-slug"' });
        expect(PermissionSystem.verifyAccess).toHaveBeenCalledWith(
            ["group-public-content"],
            DocType.Redirect,
            AclPermission.Edit,
            ["group-super-admins"],
            "any",
        );
        expect(mockDb.checkUniqueSlug).toHaveBeenCalledWith(
            "old-slug",
            expect.any(String),
            DocType.Redirect,
        );
        expect(mockDb.upsertDoc).toHaveBeenCalledTimes(1);
        expect(mockDb.upsertDoc.mock.calls[0][0] as RedirectDto).toMatchObject({
            type: DocType.Redirect,
            updatedBy: "user-1",
            memberOf: ["group-public-content"],
            slug: "old-slug",
            redirectType: RedirectType.Permanent,
            toSlug: "new-slug",
        });
    });

    it.each([
        ["missing previous doc", content(), undefined],
        ["unchanged slug", content({ slug: "same" }), content({ slug: "same" })],
        ["delete request", content({ deleteReq: 1 }), content({ slug: "old-slug" })],
        ["previous delete request", content(), content({ slug: "old-slug", deleteReq: 1 })],
        ["new draft", content({ status: PublishStatus.Draft }), content({ slug: "old-slug" })],
        ["previous draft", content(), content({ slug: "old-slug", status: PublishStatus.Draft })],
        [
            "new scheduled content",
            content({ publishDate: Date.now() + 60_000 }),
            content({ slug: "old-slug" }),
        ],
        [
            "previous scheduled content",
            content(),
            content({ slug: "old-slug", publishDate: Date.now() + 60_000 }),
        ],
        [
            "new expired content",
            content({ expiryDate: Date.now() - 1000 }),
            content({ slug: "old-slug" }),
        ],
        [
            "previous expired content",
            content(),
            content({ slug: "old-slug", expiryDate: Date.now() - 1000 }),
        ],
    ])("skips when %s", async (_name, doc, prevDoc) => {
        const mockDb = db();

        await expect(
            createSlugChangeRedirect(
                "user-1",
                doc as ContentDto,
                prevDoc as ContentDto | undefined,
                ["group-super-admins"],
                mockDb,
            ),
        ).resolves.toBeUndefined();

        expect(mockDb.upsertDoc).not.toHaveBeenCalled();
    });

    it("skips when the actor cannot edit redirects", async () => {
        (PermissionSystem.verifyAccess as jest.Mock).mockReturnValue(false);
        const mockDb = db();

        const res = await createSlugChangeRedirect(
            "user-1",
            content(),
            content({ slug: "old-slug" }),
            ["group-public-editors"],
            mockDb,
        );

        expect(res).toBeUndefined();
        expect(mockDb.checkUniqueSlug).not.toHaveBeenCalled();
        expect(mockDb.upsertDoc).not.toHaveBeenCalled();
    });

    it("warns instead of throwing when a redirect already owns the old slug", async () => {
        const mockDb = db();
        mockDb.checkUniqueSlug.mockResolvedValue(false);

        const res = await createSlugChangeRedirect(
            "user-1",
            content(),
            content({ slug: "old-slug" }),
            ["group-super-admins"],
            mockDb,
        );

        expect(res).toEqual({
            warning:
                'Could not create redirect from "old-slug" to "new-slug": a redirect already exists.',
        });
        expect(mockDb.upsertDoc).not.toHaveBeenCalled();
    });
});

describe("findSlugReversionRedirect", () => {
    afterEach(() => jest.restoreAllMocks());

    it("returns only the redirect that points from the requested slug to the current slug", async () => {
        jest.spyOn(PermissionSystem, "verifyAccess").mockReturnValue(true);
        const mockDb = db();
        const matching = {
            _id: "redirect-a-b",
            type: DocType.Redirect,
            memberOf: ["group-public-content"],
            slug: "slug-a",
            toSlug: "slug-b",
            redirectType: RedirectType.Permanent,
        } as RedirectDto;
        mockDb.getDocsBySlug.mockResolvedValue([
            { ...matching, _id: "unrelated", toSlug: "somewhere-else" },
            matching,
        ]);

        await expect(
            findSlugReversionRedirect(
                content({ slug: "slug-a" }),
                content({ slug: "slug-b" }),
                ["group-super-admins"],
                mockDb,
            ),
        ).resolves.toBe(matching);
        expect(mockDb.getDocsBySlug).toHaveBeenCalledWith("slug-a", DocType.Redirect);
    });

    it("does not consume a matching redirect without redirect edit access", async () => {
        jest.spyOn(PermissionSystem, "verifyAccess").mockReturnValue(false);
        const mockDb = db();

        await expect(
            findSlugReversionRedirect(
                content({ slug: "slug-a" }),
                content({ slug: "slug-b" }),
                ["group-public-editors"],
                mockDb,
            ),
        ).resolves.toBeUndefined();
        expect(mockDb.getDocsBySlug).not.toHaveBeenCalled();
    });
});
