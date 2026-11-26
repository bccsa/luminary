import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
import { clientCanElicit } from "./mcpContext";

const ctxWith = (capabilities?: Record<string, unknown>) =>
    ({
        mcpReq: {
            envelope: capabilities ? { [CLIENT_CAPABILITIES_META_KEY]: capabilities } : undefined,
        },
    }) as any;

describe("clientCanElicit", () => {
    it.each([
        ["no envelope (2025-era client)", undefined, false],
        ["no elicitation capability", {}, false],
        ["elicitation: {} (form mode)", { elicitation: {} }, true],
        ["form and url modes", { elicitation: { form: {}, url: {} } }, true],
        ["url mode only", { elicitation: { url: {} } }, false],
    ])("%s", (_name, capabilities, expected) => {
        expect(clientCanElicit(ctxWith(capabilities))).toBe(expected);
    });
});
