# Guest auth on Ory Kratos — UI design

Working doc for the app-side login screens. The screens themselves are real components in
`app/src/components/auth/kratos/`; run `npm run dev` in `app/` and open `/design/auth` to
see all 21 of them, light and dark, side by side.

## What "guest" means

Kratos has no anonymous identity, and it should not be made to grow one. A guest here is
simply **a visitor with no Kratos session**. The API already handles that case: an
unauthenticated request resolves through `AuthIdentityService.resolveOrDefault`, which
returns `status: "anonymous"` with the groups from provider-less `AutoGroupMappings`. Guest
browsing needs no new server work at all.

What Kratos adds is a way for a guest to _stop_ being one without leaving the app: email
plus a one-time code, no password to invent, no third-party account required.

Two consequences the design is built around:

- **"Continue without an account" is a dismissal, not a sign-in method.** It is a text link
  under the card, never a third button in the method list. `screens.spec.ts` pins that.
- **Signing in moves nothing.** Bookmarks and progress live in this device's IndexedDB. The
  guest→account screen says what will travel with the account rather than implying a
  server-side merge that does not exist yet. If per-user bookmark sync lands later, that
  screen is where the merge is announced — the copy is already shaped for it.

If identified guests are ever a real requirement (device-scoped identity now, claim it from
another device later), the alternative is a credential-less `guest` identity schema created
through the Kratos admin API from the Luminary API. It costs an identity row per device,
gives no way to authenticate _back_ into that identity, and puts every one of those rows
inside the GDPR deletion story. Not worth it without a concrete need.

## Where the pages live — recommendation

**Put them in the PWA as routes** (`/login`, `/verify`, `/recovery`, `/account`), and point
Kratos's `selfservice.flows.*.ui_url` at them. Not a standalone self-service UI.

Reasons, in the order they matter here:

1. **Translations.** Every user-facing string in this app comes from synced language docs
   through `vue-i18n`. A standalone UI cannot reach them, so the most-seen screens in the
   product would need a second translation pipeline. Screens in the app use the same `t()`
   as everything else.
2. **The installed PWA.** Redirecting to another origin drops the user out of the installed
   shell — on iOS standalone mode, into a separate browser context, which is exactly where
   session cookies go missing.
3. **One design system.** `LButton`, dark mode, Inter, the zinc/slate palette all already
   exist here. Matching them twice is a standing tax.

The cost is that we render `ui.nodes` ourselves. That is bounded: known node groups
(`code`, `oidc`, `profile`) get the bespoke components in this branch, and anything
unrecognised falls through to a generic node renderer so a Kratos upgrade that adds a method
degrades to a plain form instead of a blank screen.

What choosing this requires:

- **Kratos public API must be same-site with the app.** Reverse-proxy it under the app's own
  origin (`https://app.example.com/.ory/*` → Kratos public). This is Ory's own recommended
  setup and it makes the session cookie and the CSRF cookie work without any `SameSite`
  or CORS argument.
- **Submit the `csrf_token` node.** Every flow's `ui.nodes` carries it; build the POST body
  from the nodes rather than hand-rolling fields, or the flow 403s.
- **Handle flow expiry.** Kratos flows expire (30 min by default, code flows sooner). That
  is the `Flow expired` artboard — it restarts the flow rather than showing a raw error.
- **Allowlist `return_to`** in the Kratos config, so a guest gated on a page comes back to
  that page rather than to the home screen.

## Screens ↔ Kratos flows

| Screen (artboard)                      | Flow                                 | Notes                                                                       |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| First run — sign in or look around     | none                                 | App's own decision, before any flow starts                                  |
| Guest hits a gated action              | none                                 | Inline prompt, in place; not a modal over the content                       |
| Guest → account                        | `registration/browser`               | Names what travels with the account                                         |
| Choose a method                        | `login/browser`                      | `ui.nodes` groups `code` + `oidc`                                           |
| Choose a method — email only           | `login/browser`                      | Same screen with no `oidc` group configured                                 |
| Identifier step                        | POST `ui.action`, `method=code`      |                                                                             |
| Identifier step — invalid address      | —                                    | `ui.nodes[identifier].messages`                                             |
| Code step                              | POST `ui.action`                     | `code` node + `resend`                                                      |
| Code step — wrong code                 | —                                    | Kratos message `4010008`                                                    |
| Code step — expired                    | —                                    | Message `4060004`; resend is enabled                                        |
| Code step — rate limited               | —                                    | HTTP 429; countdown holds the resend                                        |
| Create an account                      | `registration/browser`               | `traits.email`, `traits.name`, `method=code`                                |
| Create an account — already registered | —                                    | Message `4000007`, steered to sign-in                                       |
| Confirm your email                     | `verification/browser`               | Same code component, different words                                        |
| Verified                               | —                                    | Session issued, redirect to `return_to`                                     |
| Recover an account                     | `recovery/browser`                   | `method=code`                                                               |
| Recovery sent                          | —                                    | Message `1060003` — deliberately vague, does not confirm the address exists |
| Account                                | `settings/browser` + `GET /sessions` | Sessions are an API read, not a flow                                        |
| Flow expired                           | —                                    | `410 Gone`                                                                  |
| Offline                                | —                                    | Never reaches Kratos; says what still works offline                         |
| Unhandled error                        | `self-service/errors?id=`            | Shows the reference id, not the address                                     |

## Copy and translation

`authCopy.ts` holds the English default for every string, keyed by the i18n key it will use
once the language docs carry it. `useAuthCopy()` prefers the translation and falls back to
that default, so the screens read correctly today and translate later without touching a
component. The table above doubles as the string inventory for whoever adds the keys.

## Open questions

- Does the CMS stay on the current OIDC providers while the app moves to Kratos, or is
  Kratos meant to serve both? The screens assume app-only; the method list still shows OIDC
  providers alongside email, so both can coexist.
- The privacy-policy gate (`useAuthWithPrivacyPolicy`) currently wraps every login start.
  The designs carry a privacy note in the footer instead — decide whether the modal stays in
  front of the flow or the note replaces it.
- Is a guest's bookmark set meant to sync per user once they have an account? The upgrade
  screen promises "everything saved on this device comes with you", which is true today only
  because nothing moves. It becomes a real promise the moment bookmarks sync.
