import { appPersonaTest as test, expect } from "../../fixtures/persona";
import { waitForSynced } from "../../fixtures/readiness";

/**
 * What actually reached the device is the strongest permission assertion
 * available — the API decides which group rooms a connection joins, so anything
 * the client was not entitled to never lands in IndexedDB at all.
 *
 * Every test waits for a group it *should* receive before asserting the absence
 * of one it should not; asserting absence first would pass against an empty
 * database and prove nothing.
 */
test.describe("App permission-scoped sync", () => {
    test("a public reader never receives private content", async ({ page, loginAs }) => {
        await loginAs("publicUser");
        await page.goto("/");

        const { groups } = await waitForSynced(page, { groups: ["group-public-content"] });
        expect(groups).not.toContain("group-private-content");
    });

    test("a private reader receives both content groups", async ({ page, loginAs }) => {
        await loginAs("privateUser");
        await page.goto("/");

        const { groups } = await waitForSynced(page, {
            groups: ["group-public-content", "group-private-content"],
        });
        expect(groups).toEqual(
            expect.arrayContaining(["group-public-content", "group-private-content"]),
        );
    });

    test("a guest never receives private content", async ({ page }) => {
        await page.goto("/");

        const { groups } = await waitForSynced(page, { groups: ["group-public-content"] });
        expect(groups).not.toContain("group-private-content");
    });
});
