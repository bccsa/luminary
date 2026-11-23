import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { db } from "luminary-shared";
import type { DownloadEntry } from "@/build-time/contracts/downloads/contract";
import { makeContent } from "../../__tests__/helpers";
import { remainingBytes } from "../../entries";
import { formatBytes } from "../../texts";
import { isStandIn } from "../../content";
import { mediaPlayerItem } from "@/media-player/mediaPlayer";
import DownloadCard from "../DownloadCard.vue";
import { disposeServices, downloaded, request, settle, setupUi } from "./fixtures";

beforeEach(async () => {
    await db.docs.clear();
    mediaPlayerItem.value = null;
});
afterEach(disposeServices);

type Ctx = Awaited<ReturnType<typeof setupUi>>;

function mountCard(ctx: Ctx, entry: DownloadEntry, props: Record<string, unknown> = {}) {
    return mount(DownloadCard, { props: { entry, ...props }, global: ctx.global });
}

const entryOf = (ctx: Ctx, id = "d1") => ctx.service.internals.state.byId(id)!;
const card = (wrapper: ReturnType<typeof mountCard>, part: string) =>
    wrapper.get(`[data-test='download-card-${part}']`);
const actions = (wrapper: ReturnType<typeof mountCard>) =>
    wrapper
        .findAll("[role='group'] button")
        .map((b) => b.attributes("data-test")?.replace("download-card-", ""));

/** Puts the service's copy of d1 into a state the fake engine does not reach by itself. */
function force(ctx: Ctx, patch: Partial<DownloadEntry>) {
    ctx.service.internals.state.applyEntry({ ...entryOf(ctx), ...patch });
    return entryOf(ctx);
}

describe("DownloadCard", () => {
    it("shows the snapshot's title and artwork, the selection, chapters, status and size", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        const wrapper = mountCard(ctx, entryOf(ctx));
        await settle();
        expect(wrapper.get("h3").text()).toBe("Item 1");
        expect(card(wrapper, "artwork").attributes("src")).toMatch(/^data:image\/svg\+xml,/);
        expect(card(wrapper, "selection").text()).toContain("Audio · English");
        expect(card(wrapper, "chapters").text()).toBe("3 of 3 chapters");
        expect(card(wrapper, "status").text()).toBe("Downloaded");
        expect(card(wrapper, "size").text()).toBe(formatBytes(32_000_000, "eng"));
        expect(wrapper.find("[data-test='download-card-progress']").exists()).toBe(false);
        expect(wrapper.get("article").attributes("aria-label")).toBe("Item 1");
    });

    it("names the quality of a video download", async () => {
        const ctx = await setupUi();
        await ctx.fake.start(
            request(1, {
                selection: {
                    kind: "video",
                    angleId: "main",
                    qualityId: "720",
                    audioLanguage: "fr",
                },
            }),
        );
        const wrapper = mountCard(ctx, entryOf(ctx));
        expect(card(wrapper, "selection").text()).toContain("Video · 720p · French");
    });

    it("plays the item from its stored doc and opens its content page", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        await db.docs.put(makeContent({ _id: "content-1", parentId: "post-1", slug: "item-1" }));
        const wrapper = mountCard(ctx, entryOf(ctx));
        await vi.waitFor(() => expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(true));
        const link = wrapper.getComponent(RouterLinkStub);
        expect(link.props("to")).toEqual({ name: "content", params: { slug: "item-1" } });
        // Named by what it holds, so the status and any attention line are read with the title.
        expect(link.attributes("aria-label")).toBeUndefined();
        await link.trigger("click");
        expect(mediaPlayerItem.value?.content._id).toBe("content-1");
        expect(mediaPlayerItem.value?.content.parentMedia?.hlsUrl).toBeTruthy();
        expect(mediaPlayerItem.value?.audio).toBe(true);
    });

    it("plays a stand-in made from the download when its doc is not on the device", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        const wrapper = mountCard(ctx, entryOf(ctx));
        await settle();
        expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false);
        await card(wrapper, "open").trigger("click");
        const content = mediaPlayerItem.value?.content;
        expect(content).toMatchObject({ _id: "content-1", parentId: "post-1", title: "Item 1" });
        expect(content && isStandIn(content)).toBe(true);
    });

    it("offers the content page once the doc syncs in while the page is open", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        const wrapper = mountCard(ctx, entryOf(ctx));
        await settle();
        expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false);
        await db.docs.put(makeContent({ _id: "content-1", parentId: "post-1", slug: "item-1" }));
        await vi.waitFor(() => expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(true));
    });

    it("shows live progress and its size so far while downloading", async () => {
        const ctx = await setupUi();
        await ctx.fake.start(request(1));
        ctx.fake.tick();
        ctx.fake.tick();
        const wrapper = mountCard(ctx, entryOf(ctx));
        const before = Number(card(wrapper, "progress").attributes("aria-valuenow"));
        ctx.service.internals.state.applyProgress({
            downloadId: "d1",
            bytesDone: 20_000_000,
            bytesTotal: 32_000_000,
            bytesPerSecond: 0,
            units: {},
        });
        await settle();
        expect(Number(card(wrapper, "progress").attributes("aria-valuenow"))).toBe(62);
        expect(before).toBeLessThan(62);
        expect(card(wrapper, "size").text()).toBe(
            `${formatBytes(20_000_000, "eng")} of ${formatBytes(32_000_000, "eng")}`,
        );
        expect(actions(wrapper)).toEqual(["pause", "cancel", "remove"]);
    });

    it("re-renders only for its own download's progress", async () => {
        const ctx = await setupUi();
        await ctx.fake.start(request(1));
        await ctx.fake.start(request(2));
        const one = mountCard(ctx, entryOf(ctx, "d1"));
        const two = mountCard(ctx, entryOf(ctx, "d2"));
        // What loads after mount (the artwork, the stored doc) settles first.
        await settle();
        await settle();
        const oneTree = one.vm.$.subTree;
        const twoTree = two.vm.$.subTree;
        ctx.service.internals.state.applyProgress({
            downloadId: "d1",
            bytesDone: 10_000_000,
            bytesTotal: 32_000_000,
            bytesPerSecond: 0,
            units: {},
        });
        await settle();
        // Compared as booleans: a failing vnode comparison would print the whole tree.
        expect(one.vm.$.subTree === oneTree).toBe(false);
        expect(two.vm.$.subTree === twoTree).toBe(true);
    });

    it("pauses, stops and resumes through the service", async () => {
        const ctx = await setupUi();
        await ctx.fake.start(request(1));
        const wrapper = mountCard(ctx, entryOf(ctx));
        const pause = vi.spyOn(ctx.service, "pause");
        const cancel = vi.spyOn(ctx.service, "cancel");
        const resume = vi.spyOn(ctx.service, "resume");
        await card(wrapper, "pause").trigger("click");
        await settle();
        expect(pause).toHaveBeenCalledWith("d1");
        await wrapper.setProps({ entry: entryOf(ctx) });
        expect(card(wrapper, "status").text()).toBe("Paused");
        expect(actions(wrapper)).toEqual(["resume", "cancel", "remove"]);
        await card(wrapper, "resume").trigger("click");
        await settle();
        expect(resume).toHaveBeenCalledWith("d1", { meteredConsent: false });
        await card(wrapper, "cancel").trigger("click");
        await settle();
        expect(cancel).toHaveBeenCalledWith("d1");
    });

    it("asks the mobile-data question before resuming on a metered network", async () => {
        const ctx = await setupUi({ network: { metered: true } });
        await ctx.fake.start(request(1));
        await ctx.fake.pause("d1");
        await settle();
        const wrapper = mountCard(ctx, entryOf(ctx));
        const resume = vi.spyOn(ctx.service, "resume");
        await card(wrapper, "resume").trigger("click");
        expect(resume).not.toHaveBeenCalled();
        const entry = entryOf(ctx);
        const remaining = remainingBytes(entry, ctx.service.progress.value.get("d1"));
        expect(wrapper.text()).toContain(`This may use about ${formatBytes(remaining, "eng")}.`);
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        expect(resume).toHaveBeenCalledWith("d1", { meteredConsent: true });
    });

    it("offers mobile data to a download waiting for Wi-Fi, after the question", async () => {
        const ctx = await setupUi({ network: { metered: true } });
        await ctx.fake.start(request(1));
        ctx.fake.tick();
        await settle();
        const wrapper = mountCard(ctx, entryOf(ctx));
        expect(card(wrapper, "status").text()).toBe("Waiting for Wi-Fi");
        expect(card(wrapper, "attention").text()).toContain("You can use mobile data instead.");
        const resume = vi.spyOn(ctx.service, "resume");
        await card(wrapper, "useMobileData").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        expect(resume).toHaveBeenCalledWith("d1", { meteredConsent: true });
    });

    it("removes after confirming, and says so when the download is playing", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        await ctx.service.player.open(makeContent({ parentId: "post-1" }), {
            preferOnline: false,
        });
        const wrapper = mountCard(ctx, entryOf(ctx), { playing: true });
        expect(card(wrapper, "playing").text()).toBe("Playing");
        const remove = vi.spyOn(ctx.service, "remove");
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        await card(wrapper, "remove").trigger("click");
        expect(remove).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain("“Item 1” will be removed from this device.");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(remove).toHaveBeenCalledWith(["d1"]);
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: "“Item 1” is playing and was kept." }),
        );
    });

    it("says nothing when the engine no longer holds the download it removes", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        const wrapper = mountCard(ctx, entryOf(ctx));
        vi.spyOn(ctx.fake, "remove").mockResolvedValueOnce([
            { downloadId: "d1", removed: false, code: "unknown-download", freedBytes: 0 },
        ]);
        await card(wrapper, "remove").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(notify).not.toHaveBeenCalled();
        expect(ctx.service.entries.value).toEqual([]);
    });

    it("says so when a download could not be deleted", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        const notify = vi.spyOn(ctx.notifications, "addNotification");
        const wrapper = mountCard(ctx, entryOf(ctx));
        vi.spyOn(ctx.service, "remove").mockResolvedValueOnce([
            { downloadId: "d1", removed: false, code: "io", freedBytes: 0 },
        ]);
        await card(wrapper, "remove").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: "“Item 1” could not be deleted.", state: "error" }),
        );

        vi.spyOn(ctx.service, "remove").mockRejectedValueOnce(new Error("engine"));
        notify.mockClear();
        await card(wrapper, "remove").trigger("click");
        await wrapper.get("[data-test='modal-primary-button']").trigger("click");
        await settle();
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({ title: "“Item 1” could not be deleted.", state: "error" }),
        );
        expect(wrapper.find("[data-test='download-card-remove']").attributes("disabled")).toBe(
            undefined,
        );
    });

    it("opens the sheet from My Downloads to add chapters to an eligible partial download", async () => {
        const ctx = await setupUi();
        await ctx.fake.start(request(1, { chapterIndices: [0] }));
        for (let i = 0; i < 3; i++) ctx.fake.tick();
        const content = makeContent({ _id: "content-1", slug: "item-1" });
        await db.docs.put(content);
        const wrapper = mountCard(ctx, entryOf(ctx));
        await vi.waitFor(() => expect(actions(wrapper)).toEqual(["addChapters", "remove"]));
        expect(card(wrapper, "chapters").text()).toBe("1 of 3 chapters");
        const openSheet = vi.spyOn(ctx.service, "openSheet");
        await card(wrapper, "addChapters").trigger("click");
        expect(openSheet).toHaveBeenCalledWith(expect.objectContaining({ _id: "content-1" }), {
            context: "downloads",
        });
    });

    it("offers no add when the content is not on the device", async () => {
        const ctx = await setupUi();
        await ctx.fake.start(request(1, { chapterIndices: [0] }));
        for (let i = 0; i < 3; i++) ctx.fake.tick();
        const wrapper = mountCard(ctx, entryOf(ctx));
        await settle();
        expect(actions(wrapper)).toEqual(["remove"]);
    });

    describe("a download that needs attention", () => {
        async function attention(patch: Partial<DownloadEntry>, options = {}) {
            const ctx = await setupUi(options);
            await ctx.fake.start(request(1));
            const wrapper = mountCard(ctx, force(ctx, patch));
            await settle();
            return { ctx, wrapper };
        }

        it("no space: says to free space, and resumes", async () => {
            const { wrapper } = await attention({ status: "paused", reason: "no-space" });
            expect(card(wrapper, "status").text()).toBe("Paused: not enough space");
            expect(card(wrapper, "attention").text()).toContain("Free up space, then resume.");
            expect(actions(wrapper)).toEqual(["resume", "cancel", "remove"]);
        });

        it("interrupted: says so, and resumes", async () => {
            const { wrapper } = await attention({ status: "paused", reason: "interrupted" });
            expect(card(wrapper, "attention").text()).toContain("The download was interrupted.");
            expect(actions(wrapper)).toEqual(["resume", "cancel", "remove"]);
        });

        it("key missing: asks for the key again through a re-check", async () => {
            const { ctx, wrapper } = await attention({ key: "missing" });
            expect(card(wrapper, "attention").text()).toContain("needs its key again");
            expect(card(wrapper, "fetchKey").text()).toBe("Fetch key again");
            const recheck = vi.spyOn(ctx.service.lifecycle, "recheck");
            await card(wrapper, "fetchKey").trigger("click");
            expect(recheck).toHaveBeenCalled();
        });

        it("failed with its key missing: names the key fetch and the retry apart", async () => {
            const { wrapper } = await attention({
                status: "failed",
                reason: "integrity",
                key: "missing",
            });
            expect(actions(wrapper).slice(0, 2)).toEqual(["fetchKey", "retry"]);
            expect(card(wrapper, "fetchKey").text()).toBe("Fetch key again");
            expect(card(wrapper, "retry").text()).toBe("Try again");
        });

        it("card not inserted: says to insert it, and offers only removal", async () => {
            const ctx = await setupUi({ card: true });
            await ctx.fake.start(request(1, { volumeId: "card-1" }));
            ctx.fake.setMounted("card-1", false);
            await settle();
            const wrapper = mountCard(ctx, entryOf(ctx));
            expect(card(wrapper, "attention").text()).toContain("is not inserted");
            expect(actions(wrapper)).toEqual(["remove"]);
        });

        it("failed: says why, and retries with the question on mobile data", async () => {
            const { ctx, wrapper } = await attention(
                { status: "failed", reason: "integrity" },
                { network: { metered: true } },
            );
            expect(card(wrapper, "status").text()).toBe("Download failed");
            expect(card(wrapper, "attention").text()).toContain("damaged");
            const resume = vi.spyOn(ctx.service, "resume");
            await card(wrapper, "retry").trigger("click");
            await wrapper.get("[data-test='modal-primary-button']").trigger("click");
            expect(resume).toHaveBeenCalledWith("d1", { meteredConsent: true });
        });

        it("revoked: says why and what restores it, and offers only removal", async () => {
            const { wrapper } = await attention({
                status: "revoked",
                reason: "access",
                key: "shredded",
            });
            expect(card(wrapper, "status").text()).toBe("Not available to you");
            expect(card(wrapper, "attention").text()).toContain(
                "It becomes playable again if your access returns.",
            );
            expect(actions(wrapper)).toEqual(["remove"]);
            expect(wrapper.find("[data-test='download-card-progress']").exists()).toBe(false);
        });
    });

    it("selects instead of playing while the list is choosing", async () => {
        const ctx = await setupUi();
        await downloaded(ctx.fake, 1);
        const wrapper = mountCard(ctx, entryOf(ctx), { selecting: true, selected: false });
        expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false);
        expect(wrapper.find("[role='group']").exists()).toBe(false);
        const box = card(wrapper, "select");
        expect(box.attributes("aria-label")).toBe("Select “Item 1”");
        await box.setValue(true);
        expect(wrapper.emitted("toggle")).toHaveLength(1);
    });
});
