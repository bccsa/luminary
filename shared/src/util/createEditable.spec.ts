import { describe, expect, beforeEach, test } from "vitest";
import waitForExpect from "wait-for-expect";
import { ref, nextTick, Ref } from "vue";
import { createEditable } from "./createEditable";
import { BaseDocumentDto } from "../types";

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

    test("throws if source is undefined", () => {
        expect(() => createEditable(undefined)).toThrow();
    });

    test("throws if source is not a ref of array", () => {
        // @ts-expect-error
        expect(() => createEditable(ref(null))).toThrow();
        // @ts-expect-error
        expect(() => createEditable(ref({}))).toThrow();
    });

    test("returns editable", () => {
        const { editable } = createEditable(source);
        expect(Array.isArray(editable.value)).toBe(true);
    });

    test("editable is a deep clone of source", () => {
        const { editable } = createEditable(source);
        expect(editable.value).toEqual(source.value);
        expect(editable.value).not.toBe(source.value);
    });

    test("edited is empty when nothing is changed", () => {
        const { isEdited } = createEditable(source);
        expect(isEdited.value("a")).toBe(false);
    });

    test("isEdited detects changed items", async () => {
        const { editable, isEdited } = createEditable(source);
        editable.value[0].value = 42;
        await nextTick();
        expect(isEdited.value("a")).toBe(true);
    });

    test("isEdited ignores changes to _rev, updatedTimeUtc, updatedBy", async () => {
        const { editable, isEdited } = createEditable(source);
        editable.value[0]._rev = "2";
        editable.value[0].updatedTimeUtc = 123;
        editable.value[0].updatedBy = "someone";
        await nextTick();
        expect(isEdited.value("a")).toBe(false);
    });

    test("modified contains items changed in source if a user edit exists", async () => {
        const { isModified, editable } = createEditable(source);
        editable.value[0].value = 42; // User edit
        await nextTick();
        source.value[0].value = 99;
        await nextTick();
        expect(isModified.value("a")).toBe(true);
        expect(editable.value[0].value).toBe(42); // User edit should remain
    });

    test("adding an item to source updates editable and shadow", async () => {
        const { editable, isModified, isEdited } = createEditable(source);
        await nextTick(); // Ensure initial state is set
        source.value.push(makeDoc("c", 3));
        await nextTick();
        expect(editable.value.some((d) => d._id === "c")).toBe(true);
        expect(isModified.value("c")).toBe(false);
        expect(isEdited.value("c")).toBe(false);
    });

    test("removing an item from source updates editable and shadow", async () => {
        const { editable, isModified, isEdited } = createEditable(source);
        source.value.splice(0, 1);
        await nextTick();
        expect(editable.value.some((d) => d._id === "a")).toBe(false);
        expect(isEdited.value("a")).toBe(false);
        expect(isModified.value("a")).toBe(false);
    });

    test("modifying an item in source updates editable if no user edits exist", async () => {
        const { editable, isModified, isEdited } = createEditable(source);
        await nextTick(); // Ensure initial state is set
        source.value[0].value = 100;
        await nextTick();
        expect(editable.value[0].value).toBe(100);
        expect(isModified.value("a")).toBe(false);
        expect(isEdited.value("a")).toBe(false);
    });

    test("isEdited and isModified are reactive to changes", async () => {
        const { editable, isEdited, isModified } = createEditable(source);
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
        const { editable } = createEditable(source);
        source.value.splice(0, 1, makeDoc("c", 10));
        await nextTick();
        expect(editable.value.some((d) => d._id === "a")).toBe(false);
        expect(editable.value.some((d) => d._id === "c")).toBe(true);
    });

    test("reverts changes to an item", async () => {
        const { editable, isEdited, revert } = createEditable(source);
        editable.value[0].value = 42; // User edit

        expect(isEdited.value("a")).toBe(true);

        revert("a");

        await nextTick();
        expect(editable.value[0].value).toBe(1); // Should revert to original value
        expect(isEdited.value("a")).toBe(false);
    });

    test("revert does nothing if item not found in editable", async () => {
        const { editable, revert } = createEditable(source);
        const originalLength = editable.value.length;

        revert("nonexistent");

        expect(editable.value.length).toBe(originalLength); // Length should remain unchanged
    });

    test("revert does nothing if item not found in source", async () => {
        const { editable, revert } = createEditable(source);
        editable.value.push(makeDoc("d", 4)); // Add a new item

        const originalLength = editable.value.length;
        revert("nonexistent");

        expect(editable.value.length).toBe(originalLength); // Length should remain unchanged
    });

    test("filterFn applies to editable items", () => {
        // Create a filter function that changes the value of an item from 3 to 2
        const filterFn = (item: TestDoc) => (item.value == 3 ? { ...item, value: 2 } : item);
        const e = createEditable(source, { filterFn });

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
        const e = createEditable(source, { filterFn });

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
        const e = createEditable(source, { modifyFn });

        expect(e.editable.value[1].value).toBe(3); // The modify function modifies the value internally to 3
    });

    test("modifyFn is applied to changes to the source array", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = createEditable(source, { modifyFn });

        // add a new item to the source array
        source.value.push(makeDoc("c", 2));

        await nextTick();

        expect(e.editable.value[2].value).toBe(3); // The modify function should update the new item to have value 3
    });

    test("modifyFn is applied to revert changes", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = createEditable(source, { modifyFn });

        // Change the value of the second item
        e.editable.value[1].value = 42;

        // Revert the change
        e.revert("b");

        expect(e.editable.value[1].value).toBe(3); // The modify function should update the reverted item to have value 3
    });

    test("modifyFn is applied to new items added to the editable array", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = createEditable(source, { modifyFn });

        // Add a new item to the editable array
        e.editable.value.push(makeDoc("d", 2));

        await waitForExpect(() => {
            expect(e.editable.value[2].value).toBe(3); // The modify function should update the new item to have value 3
        });
    });

    test.only("modifyFn is applied to updated items in the editable array", async () => {
        // Create a modify function that changes the value of an item from 2 to 3
        const modifyFn = (item: TestDoc) => (item.value == 2 ? { ...item, value: 3 } : item);
        const e = createEditable(source, { modifyFn });
        await nextTick();

        // Change the value of the first item
        e.editable.value[0].value = 2;

        await waitForExpect(() => {
            expect(e.editable.value[0].value).toBe(3); // The value should be 3
        });
    });
});
