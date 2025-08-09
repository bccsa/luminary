import { describe, it, expect, vi, afterEach } from "vitest";
import { ref } from "vue";
import { getRest } from "../../rest/RestApi";
import { BaseDocumentDto, DocType } from "../../types";
import waitForExpect from "wait-for-expect";
import { ApiLiveQueryAsEditable } from "./ApiLiveQueryAsEditable";

vi.mock("../../rest/RestApi", () => {
    return {
        getRest: vi.fn(() => ({
            search: vi.fn(),
        })),
    };
});

const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
};

vi.mock("../../socket/socketio", () => {
    return {
        getSocket: vi.fn(() => mockSocket),
        isConnected: ref(true),
    };
});

vi.mock("../../db/database", () => {
    return {
        db: {
            validateDeleteCommand: vi.fn(),
        },
    };
});

describe("ApiLiveQueryAsEditable", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("provides editable, isEdited, and isModified refs and revert functions", async () => {
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post }];

        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
        } as any);

        const liveQuery = new ApiLiveQueryAsEditable(query);

        const editable = liveQuery.editable;
        const isEdited = liveQuery.isEdited;
        const isModified = liveQuery.isModified;
        const revert = liveQuery.revert;

        await waitForExpect(() => {
            expect(editable.value).toEqual(mockDocs);
            expect(isEdited!.value("a")).toBe(false);
            expect(isModified!.value("a")).toBe(false);
            expect(revert).toBeDefined();
        });
    });

    it("calls changeRequest and updates editable when save is called", async () => {
        type TestDocType = BaseDocumentDto & { val: string };
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post, val: "test" } as TestDocType];

        const changeRequestMock = vi.fn().mockResolvedValue({ ack: 1 });
        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
            changeRequest: changeRequestMock,
        } as any);

        const liveQuery = new ApiLiveQueryAsEditable<TestDocType>(query);

        // Access editable to initialize
        await waitForExpect(() => {
            expect(liveQuery.editable.value).toEqual(mockDocs);
        });

        // Change the value to simulate an edit
        liveQuery.editable.value[0].val = "updated";

        const res = await liveQuery.save("1");
        expect(changeRequestMock).toHaveBeenCalled();
        expect(res).toEqual({ ack: 1 });
    });

    it("does not call changeRequest if item is not found in editable", async () => {
        type TestDocType = BaseDocumentDto & { val: string };
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post, val: "test" } as TestDocType];

        const changeRequestMock = vi.fn().mockResolvedValue({ ack: 1 });
        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
            changeRequest: changeRequestMock,
        } as any);

        const liveQuery = new ApiLiveQueryAsEditable<TestDocType>(query);

        // Access editable to initialize
        await waitForExpect(() => {
            expect(liveQuery.editable.value).toEqual(mockDocs);
        });

        const res = await liveQuery.save("1");
        expect(changeRequestMock).not.toHaveBeenCalled();
        expect(res).toEqual({ ack: "accepted" });
    });

    it("applies filter function when saving", async () => {
        type TestDocType = BaseDocumentDto & { val: string };
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post, val: "test" } as TestDocType];

        const changeRequestMock = vi.fn().mockResolvedValue({ ack: 1 });
        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
            changeRequest: changeRequestMock,
        } as any);

        const filterFn = (item: TestDocType) => ({ ...item, val: item.val.toUpperCase() });

        const liveQuery = new ApiLiveQueryAsEditable<TestDocType>(query, { filterFn });

        // Access editable to initialize
        await waitForExpect(() => {
            expect(liveQuery.editable.value).toEqual(mockDocs);
        });

        // Change the value to simulate an edit
        liveQuery.editable.value[0].val = "updated";

        const res = await liveQuery.save("1");

        waitForExpect(() => {
            expect(changeRequestMock).toHaveBeenCalledWith({
                id: 10,
                doc: { _id: "1", type: DocType.Post, val: "UPDATED" },
            });
            expect(res).toEqual({ ack: 1 });
        });
    });

    it("updates shadow copy when save is called", async () => {
        type TestDocType = BaseDocumentDto & { val: string };
        const query = ref({ types: [DocType.Post] });
        const mockDocs = [{ _id: "1", type: DocType.Post, val: "test" } as TestDocType];

        const changeRequestMock = vi.fn().mockResolvedValue({ ack: 1 });
        vi.mocked(getRest).mockReturnValue({
            search: vi.fn().mockResolvedValue({ docs: mockDocs }),
            changeRequest: changeRequestMock,
        } as any);

        const liveQuery = new ApiLiveQueryAsEditable<TestDocType>(query);

        // Access editable to initialize
        await waitForExpect(() => {
            expect(liveQuery.editable.value).toEqual(mockDocs);
        });

        // Change the value to simulate an edit
        liveQuery.editable.value[0].val = "updated";

        const res = await liveQuery.save("1");
        expect(changeRequestMock).toHaveBeenCalled();
        expect(res).toEqual({ ack: 1 });

        // If the shadow copy is updated, the "edited" state should be false
        waitForExpect(() => {
            expect(liveQuery.isEdited.value("1")).toBe(false);
        });
    });
});
