import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";

// Mocks must be declared in this file so they hoist above the EditContent import (per-file).
vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            currentRoute: {
                value: { name: "edit", params: { languageCode: "eng" } },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// @ts-expect-error
window.scrollTo = vi.fn();

import { mount } from "@vue/test-utils";
import { AckStatus, db, DocType, PostType, type ContentDto } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import EditContentMedia from "../../EditContentMedia.vue";
import { useNotificationStore } from "@/stores/notification";
import waitForExpect from "wait-for-expect";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
    mockEnglishContentDto,
} from "./EditContent.test-utils";

/**
 * A new version of the saved video is saved on its own, and the encoder is told once it
 * is stored. "Stored" is the server's word, not the local queue's.
 */
describe("EditContent - saving a new version of the video", () => {
    beforeEach(setupTestEnvironment);
    afterEach(async () => {
        vi.mocked(db.waitForLocalChangeAck).mockRestore();
        await cleanupTestEnvironment();
    });

    const mountEditor = async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });
        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentMedia).props("savedParent")).toBeDefined();
        });
        return wrapper.findComponent(EditContentMedia);
    };

    const titles = () => useNotificationStore().addNotification as any;

    it("says the video is saved only once the server has accepted it", async () => {
        let answer!: (ack: { ack: AckStatus }) => void;
        vi.spyOn(db, "waitForLocalChangeAck").mockReturnValue(
            new Promise((resolve) => (answer = resolve)) as any,
        );
        const media = await mountEditor();

        const saving = media.props("saveMediaOnly")!({ hlsUrl: "test-hls-url_r1.m3u8" });
        // Queued locally, and given every chance to report early.
        await waitForExpect(async () => expect(await db.localChanges.count()).toBe(1));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(titles()).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: "Video saved" }),
        );

        answer({ ack: AckStatus.Accepted });
        await saving;

        expect(titles()).toHaveBeenCalledWith(expect.objectContaining({ title: "Video saved" }));
        expect(media.props("savedParent")!.media?.hlsUrl).toBe("test-hls-url_r1.m3u8");
    });

    it("saves only the video, leaving the editor's other edits theirs to save", async () => {
        vi.spyOn(db, "waitForLocalChangeAck").mockResolvedValue({ ack: AckStatus.Accepted } as any);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });
        await wrapper.find('input[name="title"]').setValue("A title not saved yet");

        await wrapper.findComponent(EditContentMedia).props("saveMediaOnly")!({
            hlsUrl: "test-hls-url_r1.m3u8",
        });

        expect(titles()).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Video saved",
                description: expect.stringContaining("Your other changes are not saved yet"),
            }),
        );
        const queued = (await db.localChanges.toArray()).map((change) => change.doc?._id);
        expect(queued).toEqual([mockPostDto._id]);
        expect((await db.get<ContentDto>(mockEnglishContentDto._id))?.title).toBe(
            mockEnglishContentDto.title,
        );
        expect((wrapper.find('input[name="title"]').element as HTMLInputElement).value).toBe(
            "A title not saved yet",
        );
    });

    it("waits out a lost connection: the change is still queued, not refused", async () => {
        // The database reports a connection lost before the server answered as rejected,
        // but keeps the change queued and sends it again once the connection is back.
        const answers = vi
            .spyOn(db, "waitForLocalChangeAck")
            .mockResolvedValue({ ack: AckStatus.Rejected, message: "Saved locally." } as any);
        const media = await mountEditor();

        const saving = media.props("saveMediaOnly")!({ hlsUrl: "test-hls-url_r1.m3u8" });
        await waitForExpect(() => expect(answers).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(titles()).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: "Video not saved" }),
        );

        // Back online: the queued change goes through and is accepted.
        answers.mockResolvedValue({ ack: AckStatus.Accepted } as any);
        await db.localChanges.clear();
        await saving;

        expect(titles()).toHaveBeenCalledWith(expect.objectContaining({ title: "Video saved" }));
        expect(titles()).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: "Video not saved" }),
        );
        expect(media.props("savedParent")!.media?.hlsUrl).toBe("test-hls-url_r1.m3u8");
    });

    it("puts the saved video back when the server refuses the new one", async () => {
        // Refused without the server's copy, the local copy is deleted; left alone, the
        // editor would go on reading the refused version as saved, and acknowledge it.
        vi.spyOn(db, "waitForLocalChangeAck").mockImplementation(async () => {
            // As the server's answer does: the change leaves the queue.
            await db.localChanges.clear();
            return { ack: AckStatus.Rejected, message: "No access" } as any;
        });
        const media = await mountEditor();

        await media.props("saveMediaOnly")!({ hlsUrl: "test-hls-url_r1.m3u8" });

        expect(titles()).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Video not saved" }),
        );
        expect(media.props("savedParent")!.media?.hlsUrl).toBe("test-hls-url.m3u8");
    });
});
