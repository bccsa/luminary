import "reflect-metadata";
import processGroupDto from "./processGroupDto";
import { GroupDto } from "src/dto/GroupDto";

describe("processGroupDto", () => {
    it("sets memberOf to contain its own _id", async () => {
        const doc = { _id: "group-1", memberOf: [] } as unknown as GroupDto;
        await processGroupDto(doc);
        expect(doc.memberOf).toEqual(["group-1"]);
    });

    it("overrides any existing memberOf with its own _id", async () => {
        const doc = { _id: "group-2", memberOf: ["old-1", "old-2"] } as unknown as GroupDto;
        await processGroupDto(doc);
        expect(doc.memberOf).toEqual(["group-2"]);
    });
});
