import { computed, onUnmounted, ref, shallowRef } from "vue";
import { createFlow, fetchFlow, submitFlow } from "./client";
import { findNode, firstMessage, isAwaitingCode, oidcProviders, traitValue } from "./nodes";
import type { FlowType, KratosFlow, KratosMessage, KratosSession, SubmitResult } from "./types";

export type AuthStep =
    | "loading"
    | "identifier"
    | "code"
    | "done"
    /** Kratos refused to open the flow because a session is already live. */
    | "signed-in"
    | "expired"
    | "offline"
    | "failed";

const RESEND_COOLDOWN_SECONDS = 30;

/** Kratos names the address field differently per flow; the flow itself says which. */
function identifierField(flow: KratosFlow): string {
    for (const candidate of ["identifier", "email", "traits.email"]) {
        if (findNode(flow, candidate)) return candidate;
    }
    return "identifier";
}

/**
 * Drives one Kratos self-service flow through the designed screens. Holds no
 * opinion about which screen renders — the caller reads `step` and picks.
 */
export function useKratosAuth(type: FlowType) {
    const flow = shallowRef<KratosFlow | null>(null);
    const step = ref<AuthStep>("loading");
    const busy = ref(false);
    const email = ref("");
    const name = ref("");
    const code = ref("");
    const message = ref<KratosMessage | null>(null);
    const failure = ref("");
    const session = ref<KratosSession | null>(null);
    const resendIn = ref(0);

    let countdown: ReturnType<typeof setInterval> | undefined;
    const stopCountdown = () => {
        if (countdown) clearInterval(countdown);
        countdown = undefined;
    };
    function startCountdown() {
        stopCountdown();
        resendIn.value = RESEND_COOLDOWN_SECONDS;
        countdown = setInterval(() => {
            resendIn.value -= 1;
            if (resendIn.value <= 0) stopCountdown();
        }, 1000);
    }
    onUnmounted(stopCountdown);

    const providers = computed(() => (flow.value ? oidcProviders(flow.value) : []));

    function adopt(next: KratosFlow) {
        flow.value = next;
        message.value = firstMessage(next) ?? null;
        // Kratos re-sends what it already knows; keep the form filled after an error.
        email.value = traitValue(next, "email") || email.value;
        name.value = traitValue(next, "name") || name.value;
        step.value = isAwaitingCode(next) ? "code" : "identifier";
    }

    /** Start the flow, or pick up the one Kratos named in `?flow=`. */
    async function start(flowId?: string, returnTo?: string) {
        step.value = "loading";
        try {
            const existing = flowId ? await fetchFlow(type, flowId) : null;
            if (existing) {
                adopt(existing);
                if (isAwaitingCode(existing)) startCountdown();
                return;
            }

            const started = await createFlow(type, returnTo);
            if (started.kind === "session_exists") {
                step.value = "signed-in";
                return;
            }
            if (started.kind === "unavailable") {
                step.value = navigator.onLine === false ? "offline" : "failed";
                failure.value = "The sign-in service could not be reached.";
                return;
            }

            adopt(started.flow);
            if (isAwaitingCode(started.flow)) startCountdown();
        } catch {
            step.value = navigator.onLine === false ? "offline" : "failed";
            failure.value = "The sign-in service could not be reached.";
        }
    }

    async function send(values: Record<string, unknown>): Promise<SubmitResult | null> {
        if (!flow.value || busy.value) return null;
        busy.value = true;
        try {
            const result = await submitFlow(flow.value, values);
            switch (result.kind) {
                case "session":
                    session.value = result.session;
                    step.value = "done";
                    break;
                case "flow": {
                    const wasAwaitingCode = step.value === "code";
                    adopt(result.flow);
                    // Reaching the code step for the first time means a code was just sent.
                    if (step.value === "code" && !wasAwaitingCode) startCountdown();
                    break;
                }
                case "redirect":
                    window.location.assign(result.to);
                    break;
                case "expired":
                    step.value = "expired";
                    break;
                case "offline":
                    step.value = "offline";
                    break;
                case "error":
                    step.value = "failed";
                    failure.value = result.message;
                    break;
            }
            return result;
        } finally {
            busy.value = false;
        }
    }

    /** Step one: hand Kratos the address and have it send a code. */
    async function submitIdentifier() {
        if (!flow.value) return;
        const field = identifierField(flow.value);
        const values: Record<string, unknown> = { method: "code", [field]: email.value };
        // Registration is the only flow that carries traits alongside the address.
        if (type === "registration" && findNode(flow.value, "traits.name")) {
            values["traits.name"] = name.value;
        }
        await send(values);
    }

    /** Step two: the code itself. */
    async function submitCode() {
        if (!flow.value) return;
        const field = identifierField(flow.value);
        await send({ method: "code", [field]: email.value, code: code.value });
    }

    async function resend() {
        if (!flow.value || resendIn.value > 0) return;
        const field = identifierField(flow.value);
        code.value = "";
        const result = await send({ method: "code", [field]: email.value, resend: "code" });
        if (result?.kind === "flow") startCountdown();
    }

    /** Go back to the address step without abandoning the flow. */
    function changeIdentifier() {
        code.value = "";
        message.value = null;
        stopCountdown();
        resendIn.value = 0;
        step.value = "identifier";
    }

    function chooseProvider(provider: string) {
        return send({ method: "oidc", provider });
    }

    return {
        step,
        busy,
        email,
        name,
        code,
        message,
        failure,
        session,
        resendIn,
        providers,
        start,
        submitIdentifier,
        submitCode,
        resend,
        changeIdentifier,
        chooseProvider,
        restart: () => start(),
    };
}
