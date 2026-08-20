import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { authCopy } from "./authCopy";
import AuthCodeInput from "./AuthCodeInput.vue";
import SignInMethodsScreen from "./SignInMethodsScreen.vue";
import EmailIdentifierScreen from "./EmailIdentifierScreen.vue";
import OneTimeCodeScreen from "./OneTimeCodeScreen.vue";
import RegistrationScreen from "./RegistrationScreen.vue";
import AuthDoneScreen from "./AuthDoneScreen.vue";
import GuestWelcomeScreen from "./GuestWelcomeScreen.vue";
import GuestGateCard from "./GuestGateCard.vue";
import GuestUpgradeScreen from "./GuestUpgradeScreen.vue";
import AccountSettingsScreen from "./AccountSettingsScreen.vue";
import AuthErrorScreen from "./AuthErrorScreen.vue";

// No auth key is translated yet, so `te` is false everywhere and the screens
// fall back to the English defaults in authCopy — which is what they render in
// production until the language docs carry the keys.
vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));

describe("Kratos auth screens", () => {
    it("renders every screen with its default copy", () => {
        const cases: Array<[string, ReturnType<typeof mount>]> = [
            [authCopy["auth.methods.title"], mount(SignInMethodsScreen)],
            [authCopy["auth.email.title"], mount(EmailIdentifierScreen)],
            [
                authCopy["auth.code.title"],
                mount(OneTimeCodeScreen, { props: { email: "a@b.com" } }),
            ],
            [authCopy["auth.register.title"], mount(RegistrationScreen)],
            [authCopy["auth.verify.done_title"], mount(AuthDoneScreen)],
            [authCopy["auth.guest.title"], mount(GuestWelcomeScreen)],
            [authCopy["auth.gate.bookmarks_title"], mount(GuestGateCard)],
            [authCopy["auth.upgrade.title"], mount(GuestUpgradeScreen)],
            [
                authCopy["auth.settings.title"],
                mount(AccountSettingsScreen, { props: { email: "a@b.com" } }),
            ],
            [
                authCopy["auth.error.expired_title"],
                mount(AuthErrorScreen, { props: { kind: "expired" } }),
            ],
        ];

        for (const [heading, wrapper] of cases) {
            expect(wrapper.text()).toContain(heading);
        }
    });

    it("interpolates the address into the code screen's subtitle", () => {
        const wrapper = mount(OneTimeCodeScreen, { props: { email: "johan@example.com" } });
        expect(wrapper.text()).toContain("johan@example.com");
        expect(wrapper.text()).not.toContain("{email}");
    });

    it("offers a resend only once the countdown has run out", async () => {
        const waiting = mount(OneTimeCodeScreen, { props: { email: "a@b.com", resendIn: 20 } });
        expect(waiting.text()).toContain("20s");
        expect(waiting.text()).not.toContain(authCopy["auth.code.resend"]);

        const ready = mount(OneTimeCodeScreen, { props: { email: "a@b.com", resendIn: 0 } });
        expect(ready.text()).toContain(authCopy["auth.code.resend"]);
    });

    it("spreads a pasted code across the boxes and reports completion", async () => {
        const wrapper = mount(AuthCodeInput, { props: { label: "Code" } });
        await wrapper.find("input").trigger("paste", {
            clipboardData: { getData: () => "1 2 3-456" },
        });

        expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["123456"]);
        expect(wrapper.emitted("complete")?.at(-1)).toEqual(["123456"]);
    });

    it("keeps continuing as a guest out of the method list", () => {
        const wrapper = mount(SignInMethodsScreen, {
            props: { providers: [{ id: "bcc", label: "Continue with BCC" }] },
        });
        const methodButtons = wrapper.findAll("button");
        const guest = methodButtons.find((b) => b.text() === authCopy["auth.methods.guest"]);

        expect(guest).toBeDefined();
        // A dismissal must not wear the same clothes as a sign-in method.
        expect(guest!.classes().join(" ")).toContain("underline");
        expect(guest!.classes().join(" ")).not.toContain("border");
    });
});
