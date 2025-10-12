import "reflect-metadata";
import { validate } from "class-validator";
import { IsMongoSelector } from "./IsMongoSelector";
import { MongoSelectorDto } from "../dto/MongoSelectorDto";

class WrapperDto {
    @IsMongoSelector()
    selector!: MongoSelectorDto;
}

async function isValid(sel: any): Promise<boolean> {
    const w = new WrapperDto();
    // Assign whatever was passed in; validator will enforce instance/shape
    (w as any).selector = sel;
    const errors = await validate(w);
    return errors.length === 0;
}

describe("IsMongoSelector", () => {
    test("accepts empty selector instance", async () => {
        const s = new MongoSelectorDto();
        await expect(isValid(s)).resolves.toBe(true);
    });

    test("rejects plain object (not instance)", async () => {
        const s = {} as MongoSelectorDto;
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("accepts primitive equality fields (string/number/boolean)", async () => {
        const s = new MongoSelectorDto();
        (s as any).name = "Alice";
        (s as any).age = 30;
        (s as any).active = true;
        await expect(isValid(s)).resolves.toBe(true);
    });

    test("allows undefined field values", async () => {
        const s = new MongoSelectorDto();
        (s as any).maybe = undefined;
        await expect(isValid(s)).resolves.toBe(true);
    });

    test("accepts comparison object instance ($gte/$lte)", async () => {
        const cmp = {};
        (cmp as any).$gte = 18;
        (cmp as any).$lte = 65;
        const s = new MongoSelectorDto();
        (s as any).age = cmp;
        await expect(isValid(s)).resolves.toBe(true);
    });

    test("accepts $in with numbers/strings/booleans", async () => {
        const cmp = {};
        (cmp as any).$in = ["draft", "published", true, 1];
        const s = new MongoSelectorDto();
        (s as any).status = cmp;
        await expect(isValid(s)).resolves.toBe(true);
    });

    test("accepts $ne with number|string|boolean", async () => {
        for (const v of [10, "x", false]) {
            const cmp = {};
            (cmp as any).$ne = v;
            const s = new MongoSelectorDto();
            (s as any).field = cmp;
            // eslint-disable-next-line no-await-in-loop
            await expect(isValid(s)).resolves.toBe(true);
        }
    });

    test("accepts $and/$or with selector instances", async () => {
        const sub1 = new MongoSelectorDto();
        (sub1 as any).city = "SF";
        const sub2 = new MongoSelectorDto();
        const cmp = {};
        (cmp as any).$gt = 80;
        (sub2 as any).score = cmp;

        const s = new MongoSelectorDto();
        s.$and = [sub1];
        s.$or = [sub2];

        await expect(isValid(s)).resolves.toBe(true);
    });

    test("rejects $or when not an array", async () => {
        const s = new MongoSelectorDto();
        (s as any).$or = new MongoSelectorDto();
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects $and with non-instance subselector", async () => {
        const s = new MongoSelectorDto();
        (s as any).$and = [{}];
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects non-instance comparison object (plain object with $gt)", async () => {
        const s = new MongoSelectorDto();
        (s as any).$gt = 5;
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects non-instance subselector in $and", async () => {
        const s = new MongoSelectorDto();
        (s as any).$and = [{}]; // plain object, not instance
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects non-instance subselector in $or", async () => {
        const s = new MongoSelectorDto();
        (s as any).$or = [{}]; // plain object, not instance
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects comparison object with wrong types ($gt as string)", async () => {
        const cmp = {};
        (cmp as any).$gt = "5"; // invalid
        const s = new MongoSelectorDto();
        (s as any).age = cmp;
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects comparison object with unknown operator", async () => {
        const cmp = {};
        (cmp as any).$foo = 1; // unknown
        const s = new MongoSelectorDto();
        (s as any).field = cmp;
        await expect(isValid(s)).resolves.toBe(false);
    });

    test("rejects $in with non-array or invalid element types", async () => {
        const cmp1 = {};
        (cmp1 as any).$in = 123; // not array
        const s1 = new MongoSelectorDto();
        (s1 as any).field = cmp1;

        const cmp2 = {};
        (cmp2 as any).$in = ["ok", 1, true, { bad: true }]; // invalid element
        const s2 = new MongoSelectorDto();
        (s2 as any).field = cmp2;

        await expect(isValid(s1)).resolves.toBe(false);
        await expect(isValid(s2)).resolves.toBe(false);
    });

    test("rejects unsupported field types (arrays/objects)", async () => {
        const s1 = new MongoSelectorDto();
        (s1 as any).tags = ["a", "b"]; // array is not allowed as a primitive field value

        const s2 = new MongoSelectorDto();
        (s2 as any).nested = { a: 1 }; // plain object not recognized

        await expect(isValid(s1)).resolves.toBe(false);
        await expect(isValid(s2)).resolves.toBe(false);
    });
});
