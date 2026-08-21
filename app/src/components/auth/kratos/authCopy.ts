/**
 * Default English copy for the Kratos auth screens, keyed by the i18n key each
 * string uses once the language docs carry it. Until then `useAuthCopy` falls
 * back to the value here, so the screens read correctly before translation.
 */
export const authCopy = {
    "auth.methods.title": "Sign in",
    "auth.methods.subtitle":
        "Use your email address, or continue with an account you already have.",
    "auth.methods.guest_sign_in": "Sign in as Guest",
    "auth.methods.divider": "or",
    "auth.methods.guest": "Continue without an account",
    "auth.methods.none": "No sign-in methods are available right now.",

    "auth.email.title": "What's your email address?",
    "auth.email.subtitle": "We'll send you a 6-digit code. No password to remember.",
    "auth.email.label": "Email address",
    "auth.email.placeholder": "you@example.com",
    "auth.email.submit": "Send me a code",

    "auth.code.title": "Enter your code",
    "auth.code.subtitle": "We sent a 6-digit code to {email}.",
    "auth.code.label": "Verification code",
    "auth.code.submit": "Sign in",
    "auth.code.resend": "Send a new code",
    "auth.code.resend_in": "You can ask for a new code in {seconds}s",
    "auth.code.change_email": "Use a different email address",

    "auth.register.title": "Create your account",
    "auth.register.subtitle": "Your saved items and progress move with you, on every device.",
    "auth.register.name_label": "Name",
    "auth.register.name_placeholder": "How should we greet you?",
    "auth.register.submit": "Create account",
    "auth.register.have_account": "I already have an account",

    "auth.verify.title": "Confirm your email",
    "auth.verify.subtitle":
        "Enter the 6-digit code we sent to {email} to finish setting up your account.",
    "auth.verify.submit": "Confirm",
    "auth.verify.done_title": "You're all set",
    "auth.verify.done_subtitle": "Your email is confirmed and you're signed in.",
    "auth.verify.done_continue": "Start reading",

    "auth.upgrade.title": "Keep what you've saved",
    "auth.upgrade.subtitle":
        "You've been reading as a guest. Create an account and everything saved on this device comes with you.",
    "auth.upgrade.bookmarks": "{count} saved items",
    "auth.upgrade.progress": "Your reading and watching progress",
    "auth.upgrade.submit": "Create an account",
    "auth.upgrade.later": "Not now",

    "auth.recovery.title": "Recover your account",
    "auth.recovery.subtitle":
        "Enter the email you signed up with and we'll send you a code to get back in.",
    "auth.recovery.submit": "Send recovery code",

    "auth.settings.title": "Account",
    "auth.settings.email_section": "Email address",
    "auth.settings.methods_section": "Sign-in methods",
    "auth.settings.sessions_section": "Where you're signed in",
    "auth.settings.this_device": "This device",
    "auth.settings.sign_out_others": "Sign out everywhere else",
    "auth.settings.change": "Change",
    "auth.settings.link": "Link",
    "auth.settings.unlink": "Unlink",
    "auth.settings.delete": "Delete my account",

    "auth.guest.title": "Welcome",
    "auth.guest.subtitle":
        "Sign in to save what you read across your devices — or look around first.",
    "auth.guest.sign_in": "Sign in",
    "auth.guest.continue": "Continue without an account",

    "auth.gate.bookmarks_title": "Save this for later",
    "auth.gate.bookmarks_body":
        "Bookmarks stay on this device until you sign in. Sign in to keep them everywhere.",
    "auth.gate.sign_in": "Sign in",
    "auth.gate.dismiss": "Not now",

    "auth.error.title": "Something went wrong",
    "auth.error.expired_title": "That took a little too long",
    "auth.error.expired_body":
        "For your safety this sign-in link expired. Start again and it'll only take a moment.",
    "auth.error.offline_title": "You're offline",
    "auth.error.offline_body":
        "Signing in needs a connection. Everything already downloaded is still here to read.",
    "auth.error.restart": "Start again",
    "auth.error.back": "Back to reading",
    "auth.error.reference": "Reference: {id}",

    "auth.consent.title": "Allow {client} to sign you in?",
    "auth.consent.subtitle": "It is asking for the following. You can say no.",
    "auth.consent.allow": "Allow",
    "auth.consent.deny": "Not now",
    "auth.consent.remember": "Don't ask me again for this app",
    "auth.consent.scope.openid": "Confirm who you are",
    "auth.consent.scope.profile": "Your name and profile details",
    "auth.consent.scope.email": "Your email address",
    "auth.consent.scope.offline_access": "Keep you signed in",

    "auth.common.back": "Back",
    "auth.common.privacy_note": "By continuing you accept our privacy policy.",
} as const;

export type AuthCopyKey = keyof typeof authCopy;
