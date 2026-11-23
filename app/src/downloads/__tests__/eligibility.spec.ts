import { afterEach, describe, expect, it } from "vitest";
import { ref } from "vue";
import { DocType } from "luminary-shared";
import { isEligible } from "../content";
import { createFakeEngine } from "../fakeEngine";
import { createDownloadsService, type DownloadsRuntime } from "../service";
import { flush, grantAll, GROUP, makeContent, makeDeps, makeParent } from "./helpers";

const now = Date.now();
const groups = [GROUP];

describe("isEligible", () => {
    it("is true for an HLS master the access map lets the viewer view and download", () => {
        expect(isEligible(makeContent(), groups, grantAll(), now)).toBe(true);
    });

    it("needs a parent HLS master that is not a YouTube link", () => {
        expect(isEligible(makeContent({ parentMedia: undefined }), groups, grantAll(), now)).toBe(
            false,
        );
        expect(
            isEligible(
                makeContent({
                    parentMedia: { hlsUrl: "https://www.youtube.com/watch?v=abcdefghijk" },
                }),
                groups,
                grantAll(),
                now,
            ),
        ).toBe(false);
        // The legacy per-language video URL is not downloadable media.
        expect(
            isEligible(
                makeContent({ parentMedia: undefined, video: "https://cdn.example.org/v.mp4" }),
                groups,
                grantAll(),
                now,
            ),
        ).toBe(false);
    });

    it("needs both View and Download on the parent, with the parent's groups", () => {
        const viewOnly = { [GROUP]: { post: { view: true } } };
        const downloadOnly = { [GROUP]: { post: { download: true } } };
        expect(isEligible(makeContent(), groups, viewOnly, now)).toBe(false);
        expect(isEligible(makeContent(), groups, downloadOnly, now)).toBe(false);
        expect(isEligible(makeContent(), ["group-other"], grantAll(), now)).toBe(false);
        expect(isEligible(makeContent(), undefined, grantAll(), now)).toBe(false);
    });

    it("reads Tag grants for a tag's content", () => {
        const tagOnly = { [GROUP]: { tag: { view: true, download: true } } };
        expect(isEligible(makeContent({ parentType: DocType.Tag }), groups, tagOnly, now)).toBe(
            true,
        );
        expect(isEligible(makeContent(), groups, tagOnly, now)).toBe(false);
    });

    it("is false while the access map is empty", () => {
        expect(isEligible(makeContent(), groups, {}, now)).toBe(false);
    });

    it("is false once the content has expired", () => {
        expect(isEligible(makeContent({ expiryDate: now - 1 }), groups, grantAll(), now)).toBe(
            false,
        );
        expect(isEligible(makeContent({ expiryDate: now + 60_000 }), groups, grantAll(), now)).toBe(
            true,
        );
    });
});

describe("service.eligibility", () => {
    let service: DownloadsRuntime | undefined;
    afterEach(() => service?.dispose());

    it("takes the groups from stored content docs, which carry their parent's", async () => {
        const helpers = makeDeps();
        // The app stores content docs, not parent docs.
        helpers.docs.set("content-1", makeContent());
        service = createDownloadsService(createFakeEngine(), helpers.deps);
        await service.whenReady;
        // Feed docs carry no memberOf: the stored copy's groups decide.
        const content = ref(makeContent({ memberOf: undefined }));
        const eligible = service.eligibility(() => content.value);
        expect(eligible.value).toBe(false);
        await flush();
        expect(eligible.value).toBe(true);

        helpers.accessMap.value = { [GROUP]: { post: { view: true } } };
        expect(eligible.value).toBe(false);
        helpers.accessMap.value = grantAll();

        content.value = makeContent({ _id: "content-2", parentId: "post-2", memberOf: undefined });
        await flush();
        expect(eligible.value).toBe(false);

        // Another stored translation of the same parent.
        helpers.docs.set("content-3", makeContent({ _id: "content-3", parentId: "post-3" }));
        content.value = makeContent({ _id: "content-4", parentId: "post-3", memberOf: undefined });
        await flush();
        expect(eligible.value).toBe(true);

        // A doc that is not stored, from a remote answer, carries its groups itself.
        content.value = makeContent({ _id: "content-5", parentId: "post-5" });
        await flush();
        expect(eligible.value).toBe(true);

        // A stored parent doc is used when no content doc is stored.
        helpers.docs.set("post-6", makeParent("post-6", [GROUP]));
        content.value = makeContent({ _id: "content-6", parentId: "post-6", memberOf: undefined });
        await flush();
        expect(eligible.value).toBe(true);
    });
});
