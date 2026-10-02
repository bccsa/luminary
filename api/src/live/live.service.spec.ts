import { firstValueFrom, take, toArray } from "rxjs";
import { LiveService } from "./live.service";
import { DocType, PublishStatus } from "../enums";

/** Fully mocked: no CouchDB. The db "update" handler is captured and invoked directly. */
describe("LiveService", () => {
    let service: LiveService;
    let emitUpdate: (doc: any) => Promise<void>;
    let mockDb: any;

    const accessMap: any = {
        "group-A": {
            [DocType.Post]: { view: true, cmsView: true },
            [DocType.Tag]: { view: true },
        },
    };

    beforeEach(() => {
        mockDb = { on: jest.fn(), getDoc: jest.fn() };
        service = new LiveService({ warn: jest.fn() } as any, mockDb);
        service.onModuleInit();
        const handler = mockDb.on.mock.calls[0][1];
        emitUpdate = async (doc) => {
            await handler(doc);
        };
    });

    /** Collect the events a connection receives after the config event, while `fn` publishes. */
    async function collect(cms: boolean, fn: () => Promise<void>, map = accessMap) {
        const events: any[] = [];
        const sub = service.connect(map, cms).subscribe((e) => events.push(e));
        await fn();
        sub.unsubscribe();
        return events;
    }

    it("sends the clientConfig with the accessMap first", async () => {
        const first = await firstValueFrom(service.connect(accessMap, false));
        expect(first.type).toBe("clientConfig");
        expect((first.data as any).accessMap).toEqual(accessMap);
        expect((first.data as any).maxUploadFileSize).toBeGreaterThan(0);
    });

    it("delivers a doc only to connections with access to its type and group", async () => {
        const events = await collect(false, async () => {
            await emitUpdate({ _id: "p1", type: DocType.Post, memberOf: ["group-A"] });
            await emitUpdate({ _id: "p2", type: DocType.Post, memberOf: ["group-B"] });
            await emitUpdate({ _id: "l1", type: DocType.Language, memberOf: ["group-A"] });
        });
        const ids = events.filter((e) => e.type === "data").map((e) => e.data.docs[0]._id);
        expect(ids).toEqual(["p1"]);
    });

    it("routes content by its parent's type and groups", async () => {
        mockDb.getDoc.mockResolvedValue({
            docs: [{ _id: "p1", type: DocType.Post, memberOf: ["group-A"] }],
        });
        const content = {
            _id: "c1",
            type: DocType.Content,
            parentId: "p1",
            status: PublishStatus.Published,
        };
        const events = await collect(false, () => emitUpdate(content));
        expect(events.filter((e) => e.type === "data")).toHaveLength(1);
    });

    it("withholds draft content from app connections but not CMS connections", async () => {
        mockDb.getDoc.mockResolvedValue({
            docs: [{ _id: "p1", type: DocType.Post, memberOf: ["group-A"] }],
        });
        const draft = {
            _id: "c1",
            type: DocType.Content,
            parentId: "p1",
            status: PublishStatus.Draft,
        };

        const app = await collect(false, () => emitUpdate(draft));
        const cms = await collect(true, () => emitUpdate(draft));
        expect(app.filter((e) => e.type === "data")).toHaveLength(0);
        expect(cms.filter((e) => e.type === "data")).toHaveLength(1);
    });

    it("strips expired content for app connections and sends it in full to CMS", async () => {
        mockDb.getDoc.mockResolvedValue({
            docs: [{ _id: "p1", type: DocType.Post, memberOf: ["group-A"] }],
        });
        const expired = {
            _id: "c1",
            type: DocType.Content,
            parentId: "p1",
            status: PublishStatus.Published,
            expiryDate: 1,
            text: "body",
        };
        const app = await collect(false, () => emitUpdate(expired));
        const cms = await collect(true, () => emitUpdate(expired));
        expect(app.find((e) => e.type === "data").data.docs[0].text).toBeUndefined();
        expect(cms.find((e) => e.type === "data").data.docs[0].text).toBe("body");
    });

    it("delivers DeleteCmds to any connection with access to one of the groups", async () => {
        const del = { _id: "d1", type: DocType.DeleteCmd, memberOf: ["group-A"] };
        const events = await collect(false, () => emitUpdate(del));
        expect(events.filter((e) => e.type === "data")).toHaveLength(1);
    });

    it("never delivers sidecars or docs without groups", async () => {
        const events = await collect(false, async () => {
            await emitUpdate({ _id: "s1", type: DocType.Sidecar, memberOf: ["group-A"] });
            await emitUpdate({ _id: "p1", type: DocType.Post, memberOf: [] });
        });
        expect(events.filter((e) => e.type === "data")).toHaveLength(0);
    });

    it("gives each connection a single copy even when a doc is in several granted groups", async () => {
        const map: any = { ...accessMap, "group-B": { [DocType.Post]: { view: true } } };
        const events = await collect(
            false,
            () => emitUpdate({ _id: "p1", type: DocType.Post, memberOf: ["group-A", "group-B"] }),
            map,
        );
        expect(events.filter((e) => e.type === "data")).toHaveLength(1);
    });

    it("sends a heartbeat", async () => {
        jest.useFakeTimers();
        const p = firstValueFrom(service.connect(accessMap, false).pipe(take(2), toArray()));
        jest.advanceTimersByTime(25_000);
        const events = await p;
        jest.useRealTimers();
        expect(events.map((e) => e.type)).toEqual(["clientConfig", "ping"]);
    });
});
