import { ChangeFeedController } from "./changeFeed.controller";

describe("ChangeFeedController", () => {
    const accessMap: any = { g: {} };
    const request: any = { user: { accessMap } };

    it.each([
        ["1", true],
        ["true", true],
        ["0", false],
        ["false", false],
        [undefined, false],
    ])("cms=%s selects cms mode %s", (query, expected) => {
        const live: any = { connect: jest.fn().mockReturnValue("stream") };
        const result = new ChangeFeedController(live).stream(request, query);
        expect(live.connect).toHaveBeenCalledWith(accessMap, expected);
        expect(result).toBe("stream");
    });
});
