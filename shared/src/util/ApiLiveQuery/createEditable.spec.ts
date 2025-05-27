import { describe, it, expect, beforeEach } from "vitest";
import { ref, nextTick, Ref } from "vue";
import { createEditable } from "./createEditable";
import { BaseDocumentDto } from "../../types";

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

describe("createEditable", () => {
    let source: Ref<Array<TestDoc>>;

    beforeEach(() => {
        source = ref([makeDoc("a", 1), makeDoc("b", 2)]);
    });

    it("throws if source is undefined", () => {
        expect(() => createEditable(undefined)).toThrow();
    });

    it("throws if source is not a ref of array", () => {
        // @ts-expect-error
        expect(() => createEditable(ref(null))).toThrow();
        // @ts-expect-error
        expect(() => createEditable(ref({}))).toThrow();
    });

    it("returns editable, edited, and modified refs", () => {
        const { editable, edited, modified } = createEditable(source);
        expect(Array.isArray(editable.value)).toBe(true);
        expect(Array.isArray(edited.value)).toBe(true);
        expect(Array.isArray(modified.value)).toBe(true);
    });

    it("editable is a deep clone of source", () => {
        const { editable } = createEditable(source);
        expect(editable.value).toEqual(source.value);
        expect(editable.value).not.toBe(source.value);
    });

    it("edited is empty when nothing is changed", () => {
        const { edited } = createEditable(source);
        expect(edited.value).toEqual([]);
    });

    it("edited contains changed items", async () => {
        const { editable, edited } = createEditable(source);
        editable.value[0].value = 42;
        await nextTick();
        expect(edited.value.length).toBe(1);
        expect(edited.value[0]._id).toBe("a");
    });

    it("edited ignores changes to _rev, updatedTimeUtc, updatedBy", async () => {
        const { editable, edited } = createEditable(source);
        editable.value[0]._rev = "2";
        editable.value[0].updatedTimeUtc = 123;
        editable.value[0].updatedBy = "someone";
        await nextTick();
        expect(edited.value).toEqual([]);
    });

    it("modified is empty when nothing is changed in source", () => {
        const { modified } = createEditable(source);
        expect(modified.value).toEqual([]);
    });

    it("modified contains items changed in source", async () => {
        const { modified } = createEditable(source);
        source.value[0].value = 99;
        await nextTick();
        expect(modified.value.length).toBe(1);
        expect(modified.value[0]._id).toBe("a");
    });

    it("adding an item to source updates editable and shadow", async () => {
        const { editable, modified, edited } = createEditable(source);
        source.value.push(makeDoc("c", 3));
        await nextTick();
        expect(editable.value.some((d) => d._id === "c")).toBe(true);
        expect(modified.value.length).toBe(0);
        expect(edited.value.length).toBe(0);
    });

    it("removing an item from source updates editable and shadow", async () => {
        const { editable, modified, edited } = createEditable(source);
        source.value.splice(0, 1);
        await nextTick();
        expect(editable.value.some((d) => d._id === "a")).toBe(false);
        expect(modified.value.length).toBe(0);
        expect(edited.value.length).toBe(0);
    });

    it("edited and modified are reactive to changes", async () => {
        const { editable, edited, modified } = createEditable(source);
        editable.value[1].value = 123;
        await nextTick();
        expect(edited.value.length).toBe(1);

        source.value[1].value = 456;
        await nextTick();
        expect(modified.value.length).toBe(1);
    });

    it("handles simultaneous add and remove in source", async () => {
        const { editable } = createEditable(source);
        source.value.splice(0, 1, makeDoc("c", 10));
        await nextTick();
        expect(editable.value.some((d) => d._id === "a")).toBe(false);
        expect(editable.value.some((d) => d._id === "c")).toBe(true);
    });
});
