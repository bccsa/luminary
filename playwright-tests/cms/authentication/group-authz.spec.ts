import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cmsTest, cmsUser2Test, expect } from "../../fixtures/test";
import { readAll } from "../../fixtures/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER2_STATE_PATH = path.resolve(__dirname, "../../.auth/cms-user2.json");
const USER2_STATE_AVAILABLE = fs.existsSync(USER2_STATE_PATH);

/**
 * Group-based authorization specs. Two pre-provisioned users (in `.env`) with
 * distinct group memberships should see distinct synced content sets.
 *
 * The two users' captures are coordinated via a tiny on-disk handoff file —
 * not module state, because the cmsTest and cmsUser2Test describe blocks
 * each run inside their own fixture scope and aren't guaranteed to share
 * memory across worker boundaries.
 */
const HANDOFF_DIR = path.resolve(__dirname, "../../.auth");
const USER1_IDS_FILE = path.join(HANDOFF_DIR, "user1-content-ids.json");

type ContentRow = { _id: string; type: string; parentId?: string };

cmsTest.describe("CMS authorization — user 1 baseline", () => {
    cmsTest.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    cmsTest("user 1 syncs a non-empty content set", async ({ page }) => {
        await expect
            .poll(
                async () =>
                    (await readAll<ContentRow>(page, "docs", { type: "content" })).length,
                { timeout: 30_000 },
            )
            .toBeGreaterThan(0);

        const docs = await readAll<ContentRow>(page, "docs", { type: "content" });
        const contentIds = docs.map((d) => d._id);
        const parentIds = [
            ...new Set(docs.map((d) => d.parentId).filter((id): id is string => !!id)),
        ];
        fs.mkdirSync(HANDOFF_DIR, { recursive: true });
        fs.writeFileSync(
            USER1_IDS_FILE,
            JSON.stringify({ contentIds, parentIds }),
        );

        expect(contentIds.length).toBeGreaterThan(0);
    });
});

cmsUser2Test.describe("CMS authorization — user 2 vs user 1", () => {
    cmsUser2Test.skip(
        !USER2_STATE_AVAILABLE,
        "E2E_USER_2_EMAIL / E2E_USER_2_PASSWORD not provided — skipping multi-user authz tests",
    );

    cmsUser2Test.use({ storageState: USER2_STATE_PATH });

    cmsUser2Test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
    });

    cmsUser2Test("user 2 sees a different content set than user 1", async ({ page }) => {
        await expect
            .poll(
                async () =>
                    (await readAll<ContentRow>(page, "docs", { type: "content" })).length,
                { timeout: 30_000 },
            )
            .toBeGreaterThan(0);

        const user2Docs = await readAll<ContentRow>(page, "docs", { type: "content" });
        const user2Ids = new Set(user2Docs.map((d) => d._id));
        expect(user2Ids.size).toBeGreaterThan(0);

        cmsUser2Test.skip(
            !fs.existsSync(USER1_IDS_FILE),
            "user 1 baseline not captured — run the user-1 spec first",
        );

        const handoff = JSON.parse(fs.readFileSync(USER1_IDS_FILE, "utf8")) as {
            contentIds: string[];
            parentIds: string[];
        };
        const user1ContentIds = new Set(handoff.contentIds);

        const onlyUser1 = [...user1ContentIds].filter((id) => !user2Ids.has(id));
        const onlyUser2 = [...user2Ids].filter((id) => !user1ContentIds.has(id));

        expect(
            onlyUser1.length + onlyUser2.length,
            "users see identical content sets — group-based filtering may not be active in this env",
        ).toBeGreaterThan(0);
    });

    cmsUser2Test(
        "user 2 cannot edit a post visible only to user 1",
        async ({ page }) => {
            cmsUser2Test.skip(
                !fs.existsSync(USER1_IDS_FILE),
                "user 1 baseline not captured — run the user-1 spec first",
            );

            const handoff = JSON.parse(fs.readFileSync(USER1_IDS_FILE, "utf8")) as {
                contentIds: string[];
                parentIds: string[];
            };
            const user2Docs = await readAll<ContentRow>(page, "docs", { type: "content" });
            const user2ParentIds = new Set(
                user2Docs.map((d) => d.parentId).filter((id): id is string => !!id),
            );
            const onlyUser1Parents = handoff.parentIds.filter(
                (id) => !user2ParentIds.has(id),
            );

            cmsUser2Test.skip(
                onlyUser1Parents.length === 0,
                "no user-1-only parents found — cannot exercise blocked-edit case",
            );

            const targetParentId = onlyUser1Parents[0];
            await page.goto(`/post/edit/blog/${targetParentId}/eng`, {
                waitUntil: "domcontentloaded",
            });

            // EditContent shows an error toast and redirects to overview when
            // the parent isn't in the user's local DB (db.get returns
            // undefined). Either way the title input must not appear.
            const titleInput = page.locator('input[name="title"]');
            await page.waitForTimeout(5_000);
            await expect(titleInput).toHaveCount(0);
        },
    );
});
