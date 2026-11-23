import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { _baseDto } from "./_baseDto";
import { DocType, UserActivityType } from "../enums";

describe("document base inheritance", () => {
    it("retains shared document validation after extracting the document identity base", async () => {
        expect(
            await validate(plainToInstance(_baseDto, { _id: "post", type: DocType.Post })),
        ).toEqual([]);
        for (const raw of [
            { _id: 123, type: DocType.Post },
            { _id: "post", type: UserActivityType.Liked },
            { _id: "post", type: DocType.Post, _rev: 123 },
            { _id: "post", type: DocType.Post, deleteReq: "forged" },
        ]) {
            expect((await validate(plainToInstance(_baseDto, raw))).length).toBeGreaterThan(0);
        }
    });
});
