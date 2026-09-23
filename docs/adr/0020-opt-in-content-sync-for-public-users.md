# 20. Opt-in content sync for public users

Date: 2026-09-23

## Status

Accepted

Amends [18. Web SSG and ISR tier](0018-web-ssg-and-isr-tier.md)

## Context

Every app session used to sync content into IndexedDB. Browser tabs on the native SPA got a rolling
1-month window, installed PWAs got the full corpus, and hydrated SSG pages synced the full corpus
with no cutoff. That meant every anonymous visitor who opened one article downloaded the whole
content library, and kept it live over the socket.

Most public visitors never come back offline, and a hydrated SSG page already works for as long as
the tab stays open. For a casual visitor, a full sync costs bandwidth, device storage and API load,
and gives nothing back.

## Decision

Content sync is opt-in. The mode is decided once per launch, after auth resolves, in
`app/src/contentSyncPolicy.ts`:

| Session | Content sync |
|---|---|
| Installed PWA, Play Store app (standalone display mode or Capacitor native) | Full corpus |
| Browser tab, logged in | Rolling 1-month window |
| Browser tab, public | None |

Some small doc types are read synchronously by the UI and are still synced in every mode:
- languages
- auth providers
- redirects
- storage
- default affinity

With no content sync:
- `HybridQuery` serves Content from the API only, live over the socket rooms.
- FTS searches the server.
- Content that was synced under an earlier policy is purged once.

Shared exposes this as `setContentSyncPolicy({ enabled, publishDateCutoff })`. It is set after
`init()` and before any content sync or query. The CMS never calls it, so it keeps its full sync.

Logging in, logging out and installing the app each start a new launch, so the mode never has to
change mid-session.

## Consequences

- A public visitor downloads only what they view. Pages depend on the API while online. Offline
  access lasts only as long as the hydrated tab keeps its in-memory results.
- ADR 0018 said the web client hydrates into the same local-first data layer as native. That is now
  true only for users who opt in. A public web visitor runs the data layer in API-only mode.
- Installing the PWA or logging in is now the one step that turns on offline access. This has to
  be explained in the product, for example as an install prompt.
