import {
    acceptedContent,
    inputRequired,
    inputResponse,
    type ServerContext,
} from "@modelcontextprotocol/server";
import * as z from "zod";
import {
    clientCanElicit,
    LiveChangeState,
    ToolEnv,
    toolErrorResult,
    toolResult,
} from "./mcpContext";

const confirmSchema = z.object({
    confirm: z.boolean().describe("Apply this change to live content?"),
});

/** Returned when a live change can't be put to the human. */
export const CANNOT_CONFIRM_MESSAGE =
    "This change affects live content and needs your confirmation, which this app can't ask for. " +
    "Make the change in the Luminary CMS, or save it as a draft instead.";

/** The confirmation state carried by a retried call, already integrity-checked by the SDK. */
export function pendingConfirmation(ctx: ServerContext): LiveChangeState | undefined {
    return ctx.mcpReq.requestState?.<LiveChangeState>();
}

/**
 * Asks the human, through MCP elicitation, to confirm a change to live content. The message is
 * built by the server from the stored document, never from model-supplied text.
 *
 * Resolves `{ confirmed: true }` when the human accepted this exact change; otherwise `{ result }`
 * to return from the tool: the elicitation request itself, a decline, or an error. Clients that
 * can't elicit get an error: there is no fallback.
 */
export async function confirmLiveChange(
    env: ToolEnv,
    ctx: ServerContext,
    change: LiveChangeState & { message: string },
): Promise<{ confirmed: true } | { result: unknown }> {
    const codec = env.deps.confirmCodec;
    if (!codec || !clientCanElicit(ctx)) return { result: toolErrorResult(CANNOT_CONFIRM_MESSAGE) };

    const { message, ...binding } = change;
    const state = pendingConfirmation(ctx);
    if (!state) {
        return {
            result: inputRequired({
                inputRequests: {
                    confirm: inputRequired.elicit({ message, requestedSchema: confirmSchema }),
                },
                requestState: await codec.mint(binding, ctx),
            }),
        };
    }

    if (
        state.tool !== binding.tool ||
        state.docId !== binding.docId ||
        state.version !== binding.version ||
        state.changeHash !== binding.changeHash
    ) {
        return {
            result: toolErrorResult(
                "The document or the change differs from what was confirmed, so nothing was changed. Fetch the document and try again.",
            ),
        };
    }

    const answer = inputResponse(ctx.mcpReq.inputResponses, "confirm");
    if (answer.kind !== "elicit") {
        return { result: toolErrorResult("No confirmation was received, so nothing was changed.") };
    }
    const content = acceptedContent(ctx.mcpReq.inputResponses, "confirm", confirmSchema);
    if (answer.action === "accept" && content?.confirm === true) return { confirmed: true };

    const reason =
        answer.action === "decline"
            ? "declined by the user"
            : answer.action === "cancel"
              ? "cancelled by the user"
              : "not confirmed by the user";
    return { result: toolResult({ status: "not_applied", reason }) };
}
