import { inputRequired, inputResponse, type ServerContext } from "@modelcontextprotocol/server";
import * as z from "zod";
import {
    clientCanElicit,
    LiveChangeState,
    ToolEnv,
    toolErrorResult,
    toolResult,
} from "./mcpContext";

// Pre-ticked: pressing accept is the confirmation, and unticking the box is a way to say no.
const confirmSchema = z.object({
    confirm: z.boolean().default(true).describe("Apply this change"),
});

/** How the user answered when they didn't confirm. */
export type ConfirmAnswer = "declined" | "cancelled" | "unticked";

/** Returned when a live change can't be put to the human. */
export const CANNOT_CONFIRM_MESSAGE =
    "This change affects live content and needs your confirmation, which this app can't ask for. " +
    "Make the change in the Luminary CMS, or save it as a draft instead.";

/** The confirmation state carried by a retried call, already integrity-checked by the SDK. */
export function pendingConfirmation(ctx: ServerContext): LiveChangeState | undefined {
    return ctx.mcpReq.requestState?.<LiveChangeState>();
}

/**
 * Asks the human, through MCP elicitation, to confirm a change to live content. `describe`
 * returns the text they see; the server writes it (see `changeSummary.ts`).
 *
 * Resolves `{ confirmed: true }` when the human accepted this exact change; otherwise `{ result }`
 * to return from the tool: the elicitation request itself, the user's refusal (with `answer`), or
 * an error. Clients that can't elicit get an error: there is no fallback.
 */
export async function confirmLiveChange(
    env: ToolEnv,
    ctx: ServerContext,
    change: LiveChangeState & { describe: () => Promise<string> },
): Promise<{ confirmed: true } | { result: unknown; answer?: ConfirmAnswer }> {
    const codec = env.deps.confirmCodec;
    if (!codec || !clientCanElicit(ctx)) return { result: toolErrorResult(CANNOT_CONFIRM_MESSAGE) };

    const { describe, ...binding } = change;
    const state = pendingConfirmation(ctx);
    if (!state) {
        return {
            result: inputRequired({
                inputRequests: {
                    confirm: inputRequired.elicit({
                        message: await describe(),
                        requestedSchema: confirmSchema,
                    }),
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
    if (answer.action === "accept") {
        const content = confirmSchema.safeParse(answer.content ?? {});
        if (content.success && content.data.confirm) return { confirmed: true };
    }

    const refusal: Record<string, [ConfirmAnswer, string]> = {
        accept: ["unticked", "the user accepted without ticking 'Apply this change'"],
        decline: ["declined", "declined by the user"],
        cancel: ["cancelled", "cancelled by the user"],
    };
    const [userAnswer, reason] = refusal[answer.action];
    return { answer: userAnswer, result: toolResult({ status: "not_applied", reason }) };
}
