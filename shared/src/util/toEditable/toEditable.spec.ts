import { describe, expect, beforeEach, test, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import { ref, nextTick, Ref } from "vue";
import { toEditable } from "./toEditable";
import { AckStatus, BaseDocumentDto, ContentDto, DocType } from "../../types";
import { getRest } from "../../api/RestApi";
import { db } from "../../db/database";
import { isSyncableDoc } from "../../db/isSyncable";
import { getContentPublishDateCutoff } from "../../config";
import { touchRetention } from "../../db/retention";
import { LFormData } from "../LFormData";

// The save() routing depends on these collaborators; mock the IO/decision inputs so the routing
// logic itself (local db.upsert vs direct API changeRequest) is the unit under test.
vi.mock("../../api/RestApi", () => ({ getRest: vi.fn() }));
vi.mock("../../db/database", () => ({ db: { upsert: vi.fn() } }));
vi.mock("../../db/isSyncable", () => ({ isSyncableDoc: vi.fn() }));
vi.mock("../../db/retention", () => ({ touchRetention: vi.fn() }));
vi.mock("../../config", () => ({ getContentPublishDateCutoff: vi.fn() }));

type TestDoc = BaseDocumentDto & {
    value: number;
};

function makeDoc(id: string, value: number) {
    return {
        _id: id,
        _rev: "1",
        updatedTimeUtc: 0,
        updatedBy: "user",
        value,
    } as TestDoc;
}

describe("toEditable", () => {
    let source: Ref<Array<TestDoc>>;

    beforeEach(() => {
        source = ref([makeDoc("a", 1), makeDoc("b", 2)]);
    });

    test("throws if source is undefined", () => {
        expect(() => toEditable(undefined)).toThrow();
    });

    test("throws if source is not a ref of array", () => {
        // @ts-expect-error
        expect(() => toEditable(ref(null))).toThrow();
        // @ts-expect-error
        expect(() => toEditable(ref({}))).toThrow();
    });

    test("returns editable", () => {
        const { editable } = toEditable(source);
        expect(Array.isArray(editable.value)).toBe(true);
    });

    test("editable is a deep clone of source", () => {
        const { editable } = toEditable(source);
        expect(editable.value).toEqual(source.value);
        expect(editable.value).not.toBe(source.value);
    });

    test("edited is empty when nothing is changed", () => {
        const { isEdited } = toEditable(source);
        expect(isEdited.value("a")).toBe(false);
    });

    test("isEdited detects changed items", async () => {
        const { editable, isEdited } = toEditable(source);
        editable.value[0].value = 42;
        await nextTick();
        expect(isEdited.value("a")).toBe(true);
    });

    test("isEdited ignores changes to _rev, updatedTimeUtc, updatedBy", async () => {
        const { editable, isEdited } = toEditable(source);
        editable.value[0]._rev = "2";
        editable.value[0].updatedTimeUtc = 123;
        editable.value[0].updatedBy = "someone";
        await nextTick();
        expect(isEdited.value("a")).toBe(false);
    });

    test("modified contains items changed in source if a user edit exists", async () => {
        const { isModified, editable } = toEditable(source);
        editable.value[0].value = 42; // User edit
        await nextTick();
        source.value[0].value = 99;
        await nextTick();
        expect(isModified.value("a")).toBe(true);
        expect(editable.value[0].value).toBe(42); // User edit should remain
    });

    test("adding an item to source updates editable and shadow", async () => {
        const { editable, isModified, isEdited } = toEditable(source);
        await nextTick(); // Ensure initial state is set
        source.value.push(makeDoc("c", 3));
        await nextTick();
        expect(editable.value.some((d) => d._id === "c")).toBe(true);
        expect(isModified.value("c")).toBe(false);
        expect(isEdited.value("c")).toBe(false);
    });

    test("removing an item from source updates editable and shadow", async () => {
        const { editable, isModified, isEdited } = toEditable(source);
        source.value.splice(0, 1);
        await nextTick();
        expect(editable.value.some((d) => d._id === "a")).toBe(false);
        expect(isEdited.value("a")).toBe(false);
        expect(isModified.value("a")).toBe(false);
    });

    test("modifying an item in source updates editable if no user edits exist", async () => {
        const { editable, isModified, isEdited } = toEditable(source);
        await nextTick(); // Ensure initial state is set
        source.value[0].value = 100;
        await nextTick();
        expect(editable.value[0].value).toBe(100);
        expect(isModified.value("a")).toBe(false);
        expect(isEdited.value("a")).toBe(false);
    });

    test("isEdited and isModified are reactive to changes", async () => {
        const { editable, isEdited, isModified } = toEditable(source);
        const _isEdited = isEdited.value;
        const _isModified = isModified.value;

        expect(_isEdited("a")).toBe(false);
        expect(_isModified("a")).toBe(false);

        editable.value[1].value = 123;

        expect(_isEdited("b")).toBe(true);
        expect(_isModified("b")).toBe(false);

        source.value[1].value = 456;

        expect(_isEdited("b")).toBe(true);
        expect(_isModified("b")).toBe(true);
    });

    test("handles simultaneous add and remove in source", async () => {
        const { editable } = toEditable(source);
        source.value.splice(0, 1, makeDoc("c", 10));
        await nextTick();
        expect(editable.value.some((d) => d._id === "a")).toBe(false);
        expect(editable.value.some((d) => d._id === "c")).toBe(true);
    });

    test("reverts changes to an item", async () => {
        const { editable, isEdited, revert } = toEditable(source);
        editable.value[0].value = 42; // User edit

        expect(isEdited.value("a")).toBe(true);

        revert("a");

        await nextTick();
        expect(editable.value[0].value).toBe(1); // Should revert to original value
        expect(isEdited.value("a")).toBe(false);
    });

    test("revert does nothing if item not found in editable", async () => {
        const { editable, revert } = toEditable(source);
        const originalLength = editable.value.length;

        revert("nonexistent");

        expect(editable.value.length).toBe(originalLength); // Length should remain unchanged
    });

    test("revert does nothing if item not found in source", async () => {
        const { editable, revert } = toEditable(source);
        editable.value.push(makeDoc("d", 4)); // Add a new item

        const originalLength = editable.value.length;
        revert("nonexistent");

        expect(editable.value.length).toBe(originalLength); // Length should remain unchanged
    });

    test("filterFn applies to editable items", () => {
        // Create a filter function that changes the value of an item from 3 to 2
        const filterFn = (item: TestDoc) => (item.value == 3 ? { ...item, value: 2 } : item);
        const e = toEditable(source, { filterFn });

        // Change all items with value 2 to 3
        e.editable.value = e.editable.value.map((item) =>
            item.value === 2 ? { ...item, value: 3 } : item,
        );

        // The filter function modifies the value internally to 2, and as such the isEdited function should return false.
        expect(e.isEdited.value("b")).toBe(false);
        expect(e.isModified.value("b")).toBe(false);
    });

    test("filterFn applies to source changes", async () => {
        // Create a filter function that changes the value of an item from 3 to 2
        const filterFn = (item: TestDoc) => (item.value == 3 ? { ...item, value: 2 } : item);
        const e = toEditable(source, { filterFn });

        // Change all in the source with value 2 to 3
        source.value = source.value.map((item) =>
            item.value === 2 ? { ...item, value: 3 } : item,
        );

        // The filter function modifies the value internally to 2, and as such the isModified function should return false.
        expect(e.isEdited.value("b")).toBe(false);
        expect(e.isModified.value("b")).toBe(false);
    });

    test("modifyFn applies to editable items", () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = toEditable(source, { modifyFn });

        expect(e.editable.value[1].value).toBe(3); // The modify function modifies the value internally to 3
    });

    test("modifyFn is applied to changes to the source array", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = toEditable(source, { modifyFn });

        // add a new item to the source array
        source.value.push(makeDoc("c", 2));

        await nextTick();

        expect(e.editable.value[2].value).toBe(3); // The modify function should update the new item to have value 3
    });

    test("modifyFn is applied to revert changes", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = toEditable(source, { modifyFn });

        // Change the value of the second item
        e.editable.value[1].value = 42;

        // Revert the change
        e.revert("b");

        expect(e.editable.value[1].value).toBe(3); // The modify function should update the reverted item to have value 3
    });

    test("modifyFn is applied to new items added to the editable array", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = toEditable(source, { modifyFn });

        // Add a new item to the editable array
        e.editable.value.push(makeDoc("d", 2));

        await waitForExpect(() => {
            expect(e.editable.value[2].value).toBe(3); // The modify function should update the new item to have value 3
        });
    });

    test("modifyFn is applied to updated items in the editable array", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = toEditable(source, { modifyFn });
        await nextTick();

        // Change the value of the first item
        e.editable.value[0].value = 2;

        await waitForExpect(() => {
            expect(e.editable.value[0].value).toBe(3); // The value should be 3
        });
    });
});

describe("toEditable - save", () => {
    const CUTOFF = 1000;
    const changeRequestMock = vi.fn();

    type ContentLike = ContentDto & { title: string };

    function makeContent(id: string, publishDate?: number): ContentLike {
        return {
            _id: id,
            _rev: "1",
            type: DocType.Content,
            updatedTimeUtc: 0,
            updatedBy: "user",
            publishDate,
            title: "original",
        } as ContentLike;
    }

    type PostLike = BaseDocumentDto & { title: string; imageData?: { uploadData?: unknown[] } };

    function makePost(id: string, extra: Partial<PostLike> = {}): PostLike {
        return {
            _id: id,
            _rev: "1",
            type: DocType.Post,
            updatedTimeUtc: 0,
            updatedBy: "user",
            title: "original",
            ...extra,
        } as PostLike;
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getRest).mockReturnValue({ changeRequest: changeRequestMock } as any);
        vi.mocked(getContentPublishDateCutoff).mockReturnValue(CUTOFF);
        vi.mocked(isSyncableDoc).mockReturnValue(true);
        changeRequestMock.mockResolvedValue({ ack: AckStatus.Accepted });
    });

    test("no-ops with accepted when the item has not been edited", async () => {
        const source = ref([makeContent("a", 2000)]);
        const { save } = toEditable<ContentLike>(source);

        const res = await save("a");

        expect(res).toEqual({ ack: AckStatus.Accepted });
        expect(db.upsert).not.toHaveBeenCalled();
        expect(changeRequestMock).not.toHaveBeenCalled();
    });

    test("synced content (above cutoff) saves via the local path and clears the edited state", async () => {
        const source = ref([makeContent("a", 2000)]);
        const { editable, isEdited, save } = toEditable<ContentLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        const res = await save("a");

        expect(db.upsert).toHaveBeenCalledWith({
            doc: expect.objectContaining({ _id: "a", title: "changed" }),
            overwriteLocalChanges: true,
        });
        expect(changeRequestMock).not.toHaveBeenCalled();
        expect(touchRetention).not.toHaveBeenCalled(); // synced docs are not retention-stamped
        expect(res).toEqual({
            ack: AckStatus.Accepted,
            message: "Saved locally and queued for upload to the server",
        });
        expect(isEdited.value("a")).toBe(false);
    });

    test("below-cutoff content with persistOffline off saves via the API path", async () => {
        const source = ref([makeContent("a", 500)]);
        const { editable, save } = toEditable<ContentLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(changeRequestMock).toHaveBeenCalled();
        expect(db.upsert).not.toHaveBeenCalled();
    });

    test("below-cutoff content with persistOffline on saves locally and stamps retention", async () => {
        const source = ref([makeContent("a", 500)]);
        const { editable, save } = toEditable<ContentLike>(source, { persistOffline: true });
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(db.upsert).toHaveBeenCalled();
        expect(touchRetention).toHaveBeenCalledWith(["a"]);
        expect(changeRequestMock).not.toHaveBeenCalled();
    });

    test("content with no publishDate saves via the API path", async () => {
        const source = ref([makeContent("a")]);
        const { editable, save } = toEditable<ContentLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(changeRequestMock).toHaveBeenCalled();
        expect(db.upsert).not.toHaveBeenCalled();
    });

    test("other syncable types save via the local path without retention stamping", async () => {
        const source = ref([makePost("a")]);
        const { editable, save } = toEditable<PostLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(db.upsert).toHaveBeenCalled();
        expect(touchRetention).not.toHaveBeenCalled();
        expect(changeRequestMock).not.toHaveBeenCalled();
    });

    test("non-syncable types route by persistOffline (API when off, local when on)", async () => {
        vi.mocked(isSyncableDoc).mockReturnValue(false);

        const apiSource = ref([makePost("a")]);
        const api = toEditable<PostLike>(apiSource);
        api.editable.value[0].title = "changed";
        await nextTick();
        await api.save("a");
        expect(changeRequestMock).toHaveBeenCalled();
        expect(db.upsert).not.toHaveBeenCalled();

        vi.clearAllMocks();
        vi.mocked(getRest).mockReturnValue({ changeRequest: changeRequestMock } as any);

        const localSource = ref([makePost("b")]);
        const local = toEditable<PostLike>(localSource, { persistOffline: true });
        local.editable.value[0].title = "changed";
        await nextTick();
        await local.save("b");
        expect(db.upsert).toHaveBeenCalled();
        expect(changeRequestMock).not.toHaveBeenCalled();
    });

    test("API path uses LFormData when the document carries binary upload data", async () => {
        vi.mocked(isSyncableDoc).mockReturnValue(false);
        const source = ref([makePost("a", { imageData: { uploadData: [1, 2, 3] } })]);
        const { editable, save } = toEditable<PostLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(changeRequestMock).toHaveBeenCalledTimes(1);
        expect(changeRequestMock.mock.calls[0][0]).toBeInstanceOf(LFormData);
    });

    test("API path sends a plain change request when there is no upload data", async () => {
        vi.mocked(isSyncableDoc).mockReturnValue(false);
        const source = ref([makePost("a")]);
        const { editable, save } = toEditable<PostLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(changeRequestMock).toHaveBeenCalledWith({
            id: 10,
            doc: expect.objectContaining({ _id: "a", title: "changed" }),
        });
    });

    test("applies the filter function to the document before saving", async () => {
        vi.mocked(isSyncableDoc).mockReturnValue(false);
        const filterFn = (item: PostLike) => ({ ...item, title: item.title.toUpperCase() });
        const source = ref([makePost("a")]);
        const { editable, save } = toEditable<PostLike>(source, { filterFn });
        editable.value[0].title = "changed";
        await nextTick();

        await save("a");

        expect(changeRequestMock).toHaveBeenCalledWith({
            id: 10,
            doc: expect.objectContaining({ _id: "a", title: "CHANGED" }),
        });
    });

    test("does not clear the edited state when the API rejects the change", async () => {
        vi.mocked(isSyncableDoc).mockReturnValue(false);
        changeRequestMock.mockResolvedValue({ ack: AckStatus.Rejected });
        const source = ref([makePost("a")]);
        const { editable, isEdited, save } = toEditable<PostLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        const res = await save("a");

        expect(res).toEqual({ ack: AckStatus.Rejected });
        expect(isEdited.value("a")).toBe(true);
    });

    test("returns undefined and keeps the edited state when changeRequest fails", async () => {
        vi.mocked(isSyncableDoc).mockReturnValue(false);
        changeRequestMock.mockResolvedValue(undefined);
        const source = ref([makePost("a")]);
        const { editable, isEdited, save } = toEditable<PostLike>(source);
        editable.value[0].title = "changed";
        await nextTick();

        const res = await save("a");

        expect(res).toBeUndefined();
        expect(isEdited.value("a")).toBe(true);
    });
});
