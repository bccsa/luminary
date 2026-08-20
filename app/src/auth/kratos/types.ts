/** The slice of Kratos' flow model these screens read. Kratos sends more; nothing here needs it. */
export type KratosMessage = {
    id: number;
    text: string;
    type: "info" | "error" | "success";
};

export type KratosNode = {
    type: string;
    group: string;
    attributes: {
        name?: string;
        type?: string;
        value?: unknown;
        disabled?: boolean;
        node_type?: string;
    };
    messages?: KratosMessage[];
    meta?: { label?: { id: number; text: string } };
};

export type KratosFlow = {
    id: string;
    expires_at?: string;
    request_url?: string;
    ui: {
        action: string;
        method: string;
        nodes: KratosNode[];
        messages?: KratosMessage[];
    };
};

export type KratosSession = {
    id: string;
    active?: boolean;
    identity?: {
        id: string;
        traits: { email?: string; name?: string };
        verifiable_addresses?: { value: string; verified: boolean }[];
    };
};

export type FlowType = "login" | "registration" | "verification" | "recovery" | "settings";

/**
 * Every way a submit can land. `flow` is the ordinary "here are your validation
 * errors" case — Kratos answers 400 with the same flow, re-rendered.
 */
export type SubmitResult =
    | { kind: "session"; session: KratosSession }
    | { kind: "flow"; flow: KratosFlow }
    | { kind: "redirect"; to: string }
    | { kind: "expired" }
    | { kind: "offline" }
    | { kind: "error"; message: string };
