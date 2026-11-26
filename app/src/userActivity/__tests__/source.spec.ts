import { activityId } from "@/tests/activityStorage";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, type Ref } from "vue";
import waitForExpect from "wait-for-expect";
import {
    db,
    dataSources,
    getRest,
    initSync,
    isConnected,
    type UserActivityDto,
} from "luminary-shared";
import {
    clearLocalUserActivity,
    disposeUserActivitySource,
    getUserActivitySource,
    initUserActivitySource,
    setupUserActivitySync,
} from "../source";
import {
    clearUserActivity,
    recordUserActivity,
    getUserActivity,
    userActivityVersion,
} from "../store";
import { loadHighlightQueriesFor } from "@/recommendation/highlightStore";
import { mockEnglishContentDto } from "@/tests/mockdata";

type MockProfile = { iss: string; sub: string };
const authState = vi.hoisted(() => ({
    signedIn: null as Ref<boolean> | null,
    profile: null as Ref<MockProfile | undefined> | null,
}));

vi.mock("@/auth", async () => {
    const { ref } = await import("vue");
    authState.signedIn = ref(false);
    authState.profile = ref<MockProfile>();
    return {
        isAuthenticated: authState.signedIn,
        user: authState.profile,
    };
});
vi.mock("@/globalConfig", async () => {
    const { ref } = await import("vue");
    return { userPreferencesAsRef: ref<any>({}) };
});
import "@/auth";
import { userPreferencesAsRef } from "@/globalConfig";

const requests = vi.fn();
const query = vi.fn();
let remoteDocs: UserActivityDto[] = [];
const signIn = (sub = "one") => {
    authState.profile!.value = { iss: "https://issuer", sub };
    authState.signedIn!.value = true;
};
const loseSession = () => {
    authState.signedIn!.value = false;
    authState.profile!.value = undefined;
};
const accept = () => {
    userPreferencesAsRef.value.privacyPolicy = { status: "accepted", ts: Date.now() };
};
const queued = async () => (await getUserActivitySource()).db.localChanges.toArray();
const owner = async () =>
    (await getUserActivitySource()).db.getLuminaryInternals("userActivityOwner");

describe("activity source lifecycle", () => {
    beforeAll(async () => {
        await initSync({ post: query } as any);
        vi.spyOn(getRest(), "changeRequest").mockImplementation(requests);
    });
    afterAll(() => getRest().dispose());
    beforeEach(async () => {
        loseSession();
        userPreferencesAsRef.value = {};
        isConnected.value = false;
        dataSources.value = [];
        localStorage.removeItem("userActivityPassagesMigrated");
        localStorage.removeItem("seenArticleIds");
        await db.userActivity.clear();
        await db.luminaryInternals.delete("highlights");
        await clearLocalUserActivity();
        remoteDocs = [];
        requests.mockReset().mockImplementation(async (form: FormData) => ({
            id: JSON.parse(form.get("changeRequest__json") as string).id,
            ack: "accepted",
        }));
        query.mockReset().mockImplementation(async (_path: string, body: any) => ({
            docs: remoteDocs
                .filter(
                    (doc) =>
                        doc.type === body.selector.type &&
                        doc.updatedTimeUtc >= body.selector.updatedTimeUtc.$gte &&
                        doc.updatedTimeUtc <= body.selector.updatedTimeUtc.$lte,
                )
                .slice(0, body.limit),
        }));
    });
    afterEach(async () => {
        isConnected.value = false;
        dataSources.value = [];
        await disposeUserActivitySource();
    });

    it("moves legacy data while signed out, keeping existing docs and queueing viewed last", async () => {
        const source = await getUserActivitySource();
        await source.db.docs.put({
            _id: activityId("liked:kept"),
            type: "liked",
            parentId: "kept",
            activityTimeUtc: 1,
            updatedTimeUtc: 1,
            deleted: true,
        } as UserActivityDto);
        await db.userActivity.bulkPut([
            { _id: "viewed:first", type: "viewed", parentId: "first", updatedTimeUtc: 100 },
            { _id: "liked:new", type: "liked", parentId: "new", updatedTimeUtc: 200 },
            { _id: "liked:kept", type: "liked", parentId: "kept", updatedTimeUtc: 999 },
        ]);
        await initUserActivitySource();
        expect(await db.userActivity.count()).toBe(0);
        expect((await source.db.docs.get(activityId("liked:kept")))?.deleted).toBe(true);
        expect((await queued()).map((change) => (change.doc as UserActivityDto).type)).toEqual([
            "liked",
            "viewed",
        ]);
        expect(await owner()).toBeUndefined();
        expect(await getUserActivity("viewed")).toHaveLength(1);
        expect(requests).not.toHaveBeenCalled();
    });

    it("migrates recommendation history into the source during startup", async () => {
        await db.docs.put(mockEnglishContentDto);
        localStorage.setItem("seenArticleIds", JSON.stringify([mockEnglishContentDto._id]));
        await initUserActivitySource();

        expect(await getUserActivity("viewed")).toEqual([
            expect.objectContaining({
                _id: activityId(`viewed:${mockEnglishContentDto.parentId}`),
                parentId: mockEnglishContentDto.parentId,
                activityTimeUtc: 0,
            }),
        ]);
        expect(await queued()).toHaveLength(1);
        expect(localStorage.getItem("seenArticleIds")).toBeNull();
        expect(requests).not.toHaveBeenCalled();
        await db.docs.delete(mockEnglishContentDto._id);
    });

    it("adopts signed-out activity before enabling uploads for the first owner", async () => {
        await initUserActivitySource();
        await recordUserActivity({ type: "liked", parentId: "before-login" });
        accept();
        signIn();
        isConnected.value = true;
        dataSources.value = ["user"];
        requests.mockImplementation(async (form: FormData) => {
            expect(await owner()).toBe("https://issuer|one");
            return {
                id: JSON.parse(form.get("changeRequest__json") as string).id,
                ack: "accepted",
            };
        });
        await setupUserActivitySync();
        await waitForExpect(async () => expect(await queued()).toHaveLength(0));
        expect(requests).toHaveBeenCalledTimes(1);
        expect(JSON.parse(requests.mock.calls[0][0].get("changeRequest__json")).dataSource).toBe(
            "user",
        );
        expect(localStorage.getItem("userActivityOwner")).toBeNull();
    });

    it("holds transport while signed out, without consent, or without server capability", async () => {
        await initUserActivitySource();
        await recordUserActivity({ type: "liked", parentId: "held" });
        await setupUserActivitySync();
        isConnected.value = true;
        dataSources.value = ["user"];
        const source = await getUserActivitySource();
        expect(await source.flush(10)).toBe(false);
        signIn();
        await nextTick();
        await waitForExpect(async () => expect(await owner()).toBe("https://issuer|one"));
        expect(await source.flush(10)).toBe(false);
        dataSources.value = [];
        accept();
        await nextTick();
        expect(await source.flush(10)).toBe(false);
        expect(await queued()).toHaveLength(1);
        expect(requests).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    it("retains owner and queued edits on session loss and resumes for the same account", async () => {
        accept();
        signIn();
        await setupUserActivitySync();
        await recordUserActivity({ type: "liked", parentId: "retained" });
        loseSession();
        await nextTick();
        expect(await owner()).toBe("https://issuer|one");
        expect(await queued()).toHaveLength(1);
        expect(await getUserActivity("liked")).toHaveLength(1);
        signIn();
        isConnected.value = true;
        dataSources.value = ["user"];
        await waitForExpect(async () => expect(await queued()).toHaveLength(0));
        expect(await getUserActivity("liked")).toHaveLength(1);
    });

    it("clears another owner's data and cursor before enabling the new account", async () => {
        accept();
        signIn();
        await setupUserActivitySync();
        await recordUserActivity({ type: "liked", parentId: "private-to-one" });
        await (
            await getUserActivitySource()
        ).db.setLuminaryInternals("syncList", [{ stale: true }]);
        loseSession();
        await nextTick();
        signIn("two");
        isConnected.value = true;
        dataSources.value = ["user"];
        await waitForExpect(async () => expect(await owner()).toBe("https://issuer|two"));
        expect(await getUserActivity("liked")).toEqual([]);
        expect(await queued()).toHaveLength(0);
        expect(requests).not.toHaveBeenCalled();
        expect(await (await getUserActivitySource()).db.getLuminaryInternals("syncList")).toEqual(
            [],
        );
    });

    it("invalidates activity and highlight readers after a pull without redating history", async () => {
        accept();
        signIn();
        await setupUserActivitySync();
        remoteDocs = [
            {
                _id: activityId("highlighted:content:0-5"),
                type: "highlighted",
                parentId: "post",
                contentId: "content",
                activityTimeUtc: 10,
                updatedTimeUtc: 5000,
                range: { start: 0, end: 5, text: "hello", color: "yellow" },
            } as UserActivityDto,
        ];
        const before = userActivityVersion.value;
        isConnected.value = true;
        dataSources.value = ["user"];
        await waitForExpect(async () => {
            expect(await loadHighlightQueriesFor("content")).toEqual([
                { query: "hello", updatedAt: 10 },
            ]);
            expect(userActivityVersion.value).toBeGreaterThan(before);
        });
        expect(query).toHaveBeenCalled();
        expect(query.mock.calls.every(([path]) => path === "user/query")).toBe(true);
        expect((await getUserActivity("highlighted"))[0]).toMatchObject({
            activityTimeUtc: 10,
            updatedTimeUtc: 5000,
        });
    });

    it("clears signed-out data locally and tombstones account data when signed in", async () => {
        await initUserActivitySource();
        await recordUserActivity({ type: "liked", parentId: "local" });
        await clearUserActivity();
        expect(await queued()).toHaveLength(0);
        expect(await (await getUserActivitySource()).db.docs.count()).toBe(0);
        accept();
        signIn();
        await setupUserActivitySync();
        await recordUserActivity({ type: "liked", parentId: "account" });
        await clearUserActivity();
        expect(await getUserActivity("liked")).toEqual([]);
        expect(
            await (await getUserActivitySource()).db.docs.get(activityId("liked:account")),
        ).toMatchObject({
            deleted: true,
        });
        expect((await queued())[0].doc).toMatchObject({ deleted: true });
    });
});
