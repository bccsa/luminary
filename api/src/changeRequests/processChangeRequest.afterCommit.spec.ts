import { processChangeRequest } from "./processChangeRequest";
import { validateChangeRequest } from "./validateChangeRequest";
import processPostTagDto, { type AfterCommitTask } from "./documentProcessing/processPostTagDto";
import { DbService } from "../db/db.service";
import { ChangeReqDto } from "../dto/ChangeReqDto";

jest.mock("./validateChangeRequest", () => ({ validateChangeRequest: jest.fn() }));
jest.mock("./documentProcessing/processPostTagDto", () => ({
    __esModule: true,
    default: jest.fn(),
}));

const doc = () => ({
    _id: "post-1",
    type: "post",
    memberOf: ["group-public-content"],
    tags: [],
    publishDateVisible: true,
    postType: "blog",
});

const changeRequest = () => ({ id: 1, doc: doc() }) as unknown as ChangeReqDto;

/** `upsertOk: false` stands in for a write that did not land. */
const stubDb = (upsertOk = true) =>
    ({
        getDoc: jest.fn().mockResolvedValue({ docs: [{ _id: "post-1", type: "post" }] }),
        upsertDoc: jest.fn().mockResolvedValue({ ok: upsertOk, id: "post-1" }),
    }) as unknown as DbService;

/** Lets a test register work as processPostTagDto would, and see when it ran. */
const registering = (task: AfterCommitTask) =>
    (processPostTagDto as jest.Mock).mockImplementation(
        async (_doc, _prev, _db, afterCommit: AfterCommitTask[]) => {
            afterCommit.push(task);
            return [];
        },
    );

describe("processChangeRequest — work deferred until the document is written", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (validateChangeRequest as jest.Mock).mockImplementation(async (req: any) => ({
            validated: true,
            validatedData: req.doc,
        }));
    });

    it("runs deferred work only after the document has been written", async () => {
        const order: string[] = [];
        const db = stubDb();
        (db.upsertDoc as jest.Mock).mockImplementation(async () => {
            order.push("upsert");
            return { ok: true, id: "post-1" };
        });
        registering(async () => {
            order.push("cleanup");
            return [];
        });

        await processChangeRequest("user-1", changeRequest(), ["group-super-admins"], db);

        expect(order).toEqual(["upsert", "cleanup"]);
    });

    it("leaves the files alone when the write did not land", async () => {
        // The stored document still points at them.
        const task = jest.fn().mockResolvedValue([]);
        registering(task);

        await processChangeRequest(
            "user-1",
            changeRequest(),
            ["group-super-admins"],
            stubDb(false),
        );

        expect(task).not.toHaveBeenCalled();
    });

    it("reports what the deferred work warns about", async () => {
        registering(async () => ["the originals could not be removed"]);

        const result = await processChangeRequest(
            "user-1",
            changeRequest(),
            ["group-super-admins"],
            stubDb(),
        );

        expect(result.warnings).toContain("the originals could not be removed");
    });

    it("does not fail a landed write because the cleanup threw", async () => {
        registering(async () => {
            throw new Error("bucket is read-only");
        });

        const result = await processChangeRequest(
            "user-1",
            changeRequest(),
            ["group-super-admins"],
            stubDb(),
        );

        expect(result.result.ok).toBe(true);
        expect(result.warnings?.join(" ")).toContain("bucket is read-only");
    });
});
