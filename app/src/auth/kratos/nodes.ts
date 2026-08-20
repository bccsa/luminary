import type { KratosFlow, KratosMessage, KratosNode } from "./types";

/**
 * The values Kratos expects back, taken from the flow it just sent. Submitting
 * from the nodes rather than a hand-written body is what keeps `csrf_token` — and
 * any field a Kratos upgrade adds — in the payload without a code change here.
 */
export function collectDefaults(flow: KratosFlow): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const node of flow.ui.nodes) {
        const { name, value, type, disabled } = node.attributes;
        if (!name || disabled) continue;
        // Buttons carry the value that *would* be sent had the user pressed them.
        if (type === "submit" || type === "button") continue;
        if (value !== undefined && value !== null && value !== "") values[name] = value;
    }
    return values;
}

export function findNode(flow: KratosFlow, name: string): KratosNode | undefined {
    return flow.ui.nodes.find((node) => node.attributes.name === name);
}

/** True once Kratos has sent the code and is waiting for it — the second step of the flow. */
export function isAwaitingCode(flow: KratosFlow): boolean {
    const code = findNode(flow, "code");
    return !!code && code.attributes.type !== "hidden";
}

/** Messages from the flow and from every node, in the order Kratos sent them. */
function allMessages(flow: KratosFlow): KratosMessage[] {
    return [...(flow.ui.messages ?? []), ...flow.ui.nodes.flatMap((node) => node.messages ?? [])];
}

export function firstMessage(flow: KratosFlow): KratosMessage | undefined {
    const messages = allMessages(flow);
    // An error is what the user needs to see, even when an info message precedes it.
    return messages.find((message) => message.type === "error") ?? messages[0];
}

/** The traits already entered, so a re-render after an error doesn't blank the form. */
export function traitValue(flow: KratosFlow, trait: string): string {
    const node = findNode(flow, `traits.${trait}`);
    return node?.attributes.value ? String(node.attributes.value) : "";
}
