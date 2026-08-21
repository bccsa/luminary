import type {
    FlowStart,
    FlowType,
    KratosFlow,
    KratosSession,
    KratosSessionListEntry,
    SubmitResult,
} from "./types";
import { collectDefaults } from "./nodes";

/**
 * Same-origin by default: Vite proxies /.ory to the Kratos container in dev, and
 * production is expected to reverse-proxy the same path. Kratos' own
 * `serve.public.base_url` must agree, or the action URLs it hands back are
 * cross-site and the browser drops the session cookie.
 */
export const KRATOS_BASE = import.meta.env.VITE_KRATOS_URL || "/.ory";

/** Whether the Kratos PoC is wired up at all. No env var, no routes. */
export const isKratosEnabled = (): boolean => !!import.meta.env.VITE_KRATOS_URL;

const jsonHeaders = { Accept: "application/json", "Content-Type": "application/json" };

/** Kratos answers 410/404 for a flow that has expired or was never issued. */
const isGoneStatus = (status: number) => status === 410 || status === 404 || status === 403;

async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

/**
 * The URL a browser flow must be **navigated** to, not fetched. Kratos answers a
 * JSON fetch of this endpoint with `200 null` when it can complete the flow on
 * its own — the OAuth2 skip case, where a live session lets it accept Hydra's
 * login request immediately. Only a real navigation follows the 303 it issues.
 */
export function browserInitUrl(
    type: FlowType,
    opts: { returnTo?: string; loginChallenge?: string } = {},
): string {
    const url = new URL(`${KRATOS_BASE}/self-service/${type}/browser`, window.location.origin);
    if (opts.returnTo) url.searchParams.set("return_to", opts.returnTo);
    if (opts.loginChallenge) url.searchParams.set("login_challenge", opts.loginChallenge);
    return url.toString();
}

/**
 * Start a browser flow. `returnTo` survives the round trip and decides where
 * success lands. Being signed in already is a normal answer here, not a failure:
 * Kratos refuses to open a login or registration flow for a live session.
 */
export async function createFlow(type: FlowType, returnTo?: string): Promise<FlowStart> {
    const url = new URL(`${KRATOS_BASE}/self-service/${type}/browser`, window.location.origin);
    if (returnTo) url.searchParams.set("return_to", returnTo);

    let response: Response;
    try {
        response = await fetch(url, {
            headers: { Accept: "application/json" },
            credentials: "include",
        });
    } catch {
        return { kind: "unavailable" };
    }

    if (response.ok) return { kind: "flow", flow: await readJson<KratosFlow>(response) };

    if (response.status === 400) {
        const body = await readJson<{ error?: { id?: string } }>(response);
        if (body.error?.id === "session_already_available") return { kind: "session_exists" };
    }
    return { kind: "unavailable" };
}

/** Fetch the flow named in the URL Kratos redirected the browser to. */
export async function fetchFlow(type: FlowType, id: string): Promise<KratosFlow | null> {
    const url = new URL(`${KRATOS_BASE}/self-service/${type}/flows`, window.location.origin);
    url.searchParams.set("id", id);

    const response = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "include",
    });
    if (isGoneStatus(response.status)) return null;
    if (!response.ok) throw new Error(`Could not read the ${type} flow (${response.status})`);
    return readJson<KratosFlow>(response);
}

/**
 * Submit a flow, merging the caller's values over the ones Kratos sent. Every
 * outcome is a value, not a throw: a 400 carrying validation errors is an
 * ordinary step in these flows, not an exception.
 */
export async function submitFlow(
    flow: KratosFlow,
    values: Record<string, unknown>,
): Promise<SubmitResult> {
    let response: Response;
    try {
        response = await fetch(flow.ui.action, {
            method: flow.ui.method || "POST",
            headers: jsonHeaders,
            credentials: "include",
            body: JSON.stringify({ ...collectDefaults(flow), ...values }),
        });
    } catch {
        return { kind: "offline" };
    }

    if (isGoneStatus(response.status)) return { kind: "expired" };

    // 422 is Kratos asking the browser to go somewhere else — an OIDC hand-off,
    // or a flow that must continue at a different URL.
    if (response.status === 422) {
        const body = await readJson<{ redirect_browser_to?: string }>(response);
        return body.redirect_browser_to
            ? { kind: "redirect", to: body.redirect_browser_to }
            : { kind: "error", message: "The sign-in could not continue." };
    }

    if (response.status === 400) {
        return { kind: "flow", flow: await readJson<KratosFlow>(response) };
    }

    if (!response.ok) {
        return {
            kind: "error",
            message: `Unexpected response from the sign-in service (${response.status})`,
        };
    }

    const body = await readJson<{
        session?: KratosSession;
        continue_with?: { action: string; flow?: { id: string } }[];
        redirect_browser_to?: string;
    }>(response);

    if (body.session) return { kind: "session", session: body.session };
    if (body.redirect_browser_to) return { kind: "redirect", to: body.redirect_browser_to };
    // Registration that still owes a verification step reports it here.
    const verification = body.continue_with?.find((step) => step.action === "show_verification_ui");
    if (verification?.flow?.id) {
        return { kind: "redirect", to: `/auth/verify?flow=${verification.flow.id}` };
    }
    return { kind: "error", message: "The sign-in could not be completed." };
}

/** The current session, or null when there isn't one. Never throws for "not signed in". */
export async function whoami(): Promise<KratosSessionListEntry | null> {
    try {
        const response = await fetch(
            new URL(`${KRATOS_BASE}/sessions/whoami`, window.location.origin),
            {
                headers: { Accept: "application/json" },
                credentials: "include",
            },
        );
        if (!response.ok) return null;
        return await readJson<KratosSessionListEntry>(response);
    } catch {
        return null;
    }
}

/**
 * The identity's *other* sessions. Kratos deliberately leaves the current one
 * out — that comes from `whoami` — so the account screen joins the two.
 */
export async function listOtherSessions(): Promise<KratosSessionListEntry[]> {
    const response = await fetch(new URL(`${KRATOS_BASE}/sessions`, window.location.origin), {
        headers: { Accept: "application/json" },
        credentials: "include",
    });
    if (!response.ok) return [];
    return readJson<KratosSessionListEntry[]>(response);
}

/** Ends every session except this one. Kratos models it as deleting the others. */
export async function signOutOtherSessions(): Promise<boolean> {
    const response = await fetch(new URL(`${KRATOS_BASE}/sessions`, window.location.origin), {
        method: "DELETE",
        headers: { Accept: "application/json" },
        credentials: "include",
    });
    return response.ok;
}

/** Kratos hands out a single-use logout URL rather than accepting a bare POST. */
export async function logout(): Promise<boolean> {
    const response = await fetch(
        new URL(`${KRATOS_BASE}/self-service/logout/browser`, window.location.origin),
        { headers: { Accept: "application/json" }, credentials: "include" },
    );
    if (!response.ok) return false;

    const { logout_url } = await readJson<{ logout_url: string }>(response);
    const done = await fetch(logout_url, {
        headers: { Accept: "application/json" },
        credentials: "include",
    });
    return done.ok;
}
