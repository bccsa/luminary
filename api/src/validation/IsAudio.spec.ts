import { validateSync } from "class-validator";
import { IsAudio } from "./IsAudio";

class TestClass {
    @IsAudio()
    audio: any;
}

function createInstance(value: any): TestClass {
    const obj = new TestClass();
    obj.audio = value;
    return obj;
}

describe("IsAudio", () => {
    it("should fail for null value", async () => {
        const obj = createInstance(null);
        // Async validator, so use validate instead of validateSync
        const { validate } = await import("class-validator");
        const errors = await validate(obj);
        expect(errors.length).toBeGreaterThan(0);
    });

    it("should fail for empty buffer (byteLength === 0)", async () => {
        const obj = createInstance(Buffer.alloc(0));
        const { validate } = await import("class-validator");
        const errors = await validate(obj);
        expect(errors.length).toBeGreaterThan(0);
    });

    it("should fail for undefined value", async () => {
        const obj = createInstance(undefined);
        const { validate } = await import("class-validator");
        const errors = await validate(obj);
        expect(errors.length).toBeGreaterThan(0);
    });

    it("should fail for invalid audio data", async () => {
        const obj = createInstance(Buffer.from("not-audio-data"));
        const { validate } = await import("class-validator");
        const errors = await validate(obj);
        expect(errors.length).toBeGreaterThan(0);
    });
});
