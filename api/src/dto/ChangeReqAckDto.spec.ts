import { ChangeReqAckDto } from "./ChangeReqAckDto";
import { AckStatus } from "../enums";

describe("ChangeReqAckDto", () => {
    it("should create an instance with ack status", () => {
        const dto = new ChangeReqAckDto();
        dto.ack = AckStatus.Accepted;
        expect(dto.ack).toBe(AckStatus.Accepted);
    });

    it("should support optional message and warnings", () => {
        const dto = new ChangeReqAckDto();
        dto.ack = AckStatus.Rejected;
        dto.message = "Insufficient permissions";
        dto.warnings = ["Image upload failed"];
        dto.docs = [];
        expect(dto.message).toBe("Insufficient permissions");
        expect(dto.warnings).toHaveLength(1);
    });
});
