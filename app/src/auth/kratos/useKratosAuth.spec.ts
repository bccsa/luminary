import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import fixtures from "./fixtures.spec-data.json";
import { useKratosAuth } from "./useKratosAuth";
import { createFlow, submitFlow } from "./client";
import type { FlowType, KratosFlow, SubmitResult } from "./types";

vi.mock("./client", () => ({
    createFlow: vi.fn(),
    fetchFlow: vi.fn(),
    submitFlow: vi.fn(),
}));

const registrationStart = fixtures.registrationStart as KratosFlow;
const awaitingCode = fixtures.registrationAwaitingCode as KratosFlow;
const loginStart = fixtures.loginStart as KratosFlow;

/** onUnmounted needs a component instance, so the composable is hosted in one. */
function host(type: FlowType) {
    let auth!: ReturnType<typeof useKratosAuth>;
    const wrapper = mount(
        defineComponent({
            setup() {
                auth = useKratosAuth(type);
                return () => null;
            },
        }),
    );
    return { auth, wrapper };
}

const submitted = () => vi.mocked(submitFlow).mock.calls.at(-1)![1];

describe("useKratosAuth", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(createFlow).mockResolvedValue({ kind: "flow", flow: registrationStart });
        vi.mocked(submitFlow).mockResolvedValue({ kind: "flow", flow: awaitingCode });
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("reports an existing session instead of failing the flow", async () => {
        // Kratos answers 400 session_already_available rather than opening a
        // login flow for a live session; that is not an error to show the user.
        vi.mocked(createFlow).mockResolvedValue({ kind: "session_exists" });
        const { auth } = host("login");
        await auth.start();

        expect(auth.step.value).toBe("signed-in");
        expect(auth.failure.value).toBe("");
    });

    it("shows the failure screen when Kratos cannot be reached", async () => {
        vi.mocked(createFlow).mockResolvedValue({ kind: "unavailable" });
        const { auth } = host("login");
        await auth.start();

        expect(auth.step.value).toBe("failed");
    });

    it("opens on the address step", async () => {
        const { auth } = host("registration");
        await auth.start();
        expect(auth.step.value).toBe("identifier");
    });

    it("submits registration as traits, because that is what the flow asks for", async () => {
        const { auth } = host("registration");
        await auth.start();
        auth.email.value = "johan@example.com";
        auth.name.value = "Johan";
        await auth.submitIdentifier();

        expect(submitted()).toMatchObject({
            method: "code",
            "traits.email": "johan@example.com",
            "traits.name": "Johan",
        });
    });

    it("submits login as an identifier, because that is what that flow asks for", async () => {
        vi.mocked(createFlow).mockResolvedValue({ kind: "flow", flow: loginStart });
        const { auth } = host("login");
        await auth.start();
        auth.email.value = "johan@example.com";
        await auth.submitIdentifier();

        expect(submitted()).toMatchObject({ method: "code", identifier: "johan@example.com" });
        expect(submitted()).not.toHaveProperty("traits.email");
    });

    it("moves to the code step and holds the resend behind a countdown", async () => {
        const { auth } = host("registration");
        await auth.start();
        await auth.submitIdentifier();

        expect(auth.step.value).toBe("code");
        expect(auth.resendIn.value).toBe(30);

        await auth.resend();
        expect(vi.mocked(submitFlow)).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(30_000);
        expect(auth.resendIn.value).toBe(0);
        await auth.resend();
        expect(submitted()).toMatchObject({ resend: "code" });
    });

    it("keeps the address on screen when Kratos re-renders the flow", async () => {
        const { auth } = host("registration");
        await auth.start();
        auth.email.value = "johan@example.com";
        await auth.submitIdentifier();

        // The awaiting-code flow echoes the traits back as hidden nodes.
        expect(auth.email.value).toBe("johan@example.com");
    });

    it("ends on the done step once a session comes back", async () => {
        const { auth } = host("registration");
        await auth.start();
        vi.mocked(submitFlow).mockResolvedValue({
            kind: "session",
            session: { id: "s1", active: true },
        } as SubmitResult);
        await auth.submitIdentifier();

        expect(auth.step.value).toBe("done");
        expect(auth.session.value?.id).toBe("s1");
    });

    it("shows the expired screen rather than a generic failure", async () => {
        const { auth } = host("registration");
        await auth.start();
        vi.mocked(submitFlow).mockResolvedValue({ kind: "expired" });
        await auth.submitCode();

        expect(auth.step.value).toBe("expired");
    });

    it("goes back to the address step without abandoning the flow", async () => {
        const { auth } = host("registration");
        await auth.start();
        await auth.submitIdentifier();
        auth.code.value = "123456";

        auth.changeIdentifier();
        expect(auth.step.value).toBe("identifier");
        expect(auth.code.value).toBe("");
        expect(auth.resendIn.value).toBe(0);
    });
});
