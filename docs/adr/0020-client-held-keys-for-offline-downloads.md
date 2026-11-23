# 20. Client-held HLS keys for offline downloads

Date: 2026-11-20

## Status

Accepted

Supersedes the offline-playback clause of [ADR 0019](0019-hls-encryption-keys-as-non-replicated-sidecars.md)
("Offline playback of encrypted media is out of scope"). The rest of ADR 0019 stands.

## Context

The native Android and iOS apps can download audio and video and play it offline, including from
the lock screen, for as long as the content has not expired. Encrypted media needs its AES-128 key
to play, and ADR 0019 deliberately serves that key one request at a time from `GET /sidecar`,
never persisted on the client, and left offline playback out of scope because holding keys on the
device partly undoes its no-bulk-extraction property.

An offline-first app cannot play an encrypted download without the key on the device. The choice
is therefore between not offering encrypted downloads and holding keys on the client. This ADR
records the second choice and the limits around it.

Who may download is decided by a new ACL permission, `Download`, assignable on Post and Tag like
`Share`. Granting it to a public group lets signed-out users download.

## Decision

**The client holds one key per downloaded item, in the platform's secure key storage, for as long
as the download exists and the user's access map still grants it.**

### The download permission is policy, not a security boundary

Anyone with `View` on a parent can already fetch its key (ADR 0019), and the key passes through
JavaScript when playback opens, exactly as it does for streaming. A modified client can therefore
download and keep any media its user may view, whatever `Download` says. `Download` expresses what
the publisher offers and what an honest client shows; it does not stop a determined user. The app
enforces it from the access map: starting a download needs both `Download` and `View` on the parent.

### The key endpoint is unchanged

`GET /sidecar` keeps checking `View` (or `CmsView` for the CMS), its publication gate, and its two
rate limiters, exactly as for streaming. A download-specific check there would add no security,
since a modified client would simply not ask for it, and it would make one key serve two policies.

No schema upgrade backfills `Download`, and no seeded group holds it. Granting it in the CMS is the
rollout switch.

### Key fetch outcomes

A client deciding whether to destroy a stored key must tell "access is gone" apart from "the request
failed". `luminary-shared` provides `fetchHlsKeyOutcome`, which answers one of:

| Outcome | When |
|---|---|
| key | 200 with a well-formed payload |
| `denied` | a 403 or 404 the API itself answered: its error body `{ statusCode, message }` with a matching `statusCode`, and for a 404 the endpoint's own `"Not found"`. The endpoint refuses with 404 only; an API-shaped 403 is accepted so that a later change of the endpoint's refusal status needs no client release |
| `rateLimited` | 429 |
| `unreachable` | anything else: no response, 401, 5xx, a corrupt or malformed payload, and a 403 or 404 without the API's error body (a proxy, firewall or captive portal, or an unknown route) |

Only `denied` may lead to a key being destroyed, and only for a request sent with the current
session's credentials. The API does not reject a request that carries none; it answers it as an
anonymous caller, so a key fetch sent before the session's credentials are applied reads as
`denied` for a user who does have access. Clients therefore act on `denied` only once the access map
of the current connection has arrived. Key re-fetches are paced on the client (about one
every 5 s, giving way whenever playback needs a key, and waiting a minute after a rate-limit
response), well under the endpoint's `read` limiter.

### How keys are stored

| Platform | Storage |
|---|---|
| Android | An AES-256-GCM key in AndroidKeyStore, never bound to user authentication, wraps each download's 16-byte key. The wrapped key is stored with the download. |
| iOS | One Keychain item per download, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so it never migrates to another device, and is readable for lock-screen playback once the device has been unlocked after boot. Keychain items outlive the app, so the first launch after an install deletes any left behind. |

A key is verified when it arrives by decrypting the download's stored master playlist with it.
Unencrypted media has no key; revoking access to it is a state on the download's record that blocks
playback.

### When keys are shredded and downloads deleted

| Event | Effect |
|---|---|
| Logout | **Not a trigger.** Logout does not clear the stored access map; the signed-out map arrives on reconnect and decides, like any other map change. |
| Access-map change | Each download is re-checked against the new map, and a download is re-checked on its own when its parent's groups change (a permission-change delete command, or an updated parent doc), with the new groups. Without `Download` or `View` on the parent, playback of it stops and its key is shredded; the files are kept, so a regained grant only re-fetches the key; keyless downloads are deleted after 30 days. An empty map means "not loaded" and is ignored. |
| Another user signs in | Downloads are handed over: wherever the new access map grants download access, keys are re-fetched. |
| Expiry | When the device clock passes the latest expiry among the translations the user may view or has offline, playback stops, the key is shredded and the files are deleted, online or not. |
| Takedown (unpublished, deleted, expiry moved to now) | When no published translation is left that the user may view or has offline, playback stops, the key is shredded and the files are deleted, but only with corroboration: a `deleted` or `statusChange` delete command for the parent or its content within the last hour, the engine finding the source gone, or the same successful empty answer again on a later connection. One empty answer only records a strike, because a successful empty answer is also what an anonymous or not-yet-authenticated caller gets; an answer that lists a translation clears it. A delete command for a downloaded item triggers the re-check while the app is open and online; without a delete command, a takedown completes on the second connection that gets the empty answer. A group change is checked for access first, so a parent moved out of the user's View groups is revoked for access (files kept), never taken down. |
| `unreachable` or `rateLimited` key fetch | Never shreds a key. |

There is no offline time limit and no check-in. Playback needs only the files, the stored key and
the download's record; it does not depend on a login, a token, the content sync window or the
content doc being present. A downloaded item's content docs are pinned against local eviction for
as long as the download exists.

## Consequences

- Encrypted media can be played offline for as long as it has not expired, with no login and no
  connection.
- A device holds one key per downloaded item. The bulk extraction ADR 0019 guards against becomes
  possible for one user on one device, bounded by what that user may view and by the endpoint's
  rate limits on the original fetch. Keys stay per collection, so one leaked key still costs one
  collection.
- Takedowns do not reach an offline device. An unpublished item stays playable until the device
  connects with the app open and the takedown is corroborated, which without a delete command is
  the second connection that gets the empty answer. An expiry date on sensitive content is the
  only bound that holds offline.
- Immediate deletion on expiry trusts the device clock. A wrong clock can delete content early.
- Public downloads share the endpoint's per-identity limits, which for signed-out callers are keyed
  by network address, so many devices behind one address share one budget. Client pacing keeps a
  single device well inside it.
- Deploy order is api, cms, shared, app, then the native apps. `Download` should be granted only
  after the CMS is deployed, because a CMS tab that does not know a permission strips it on save.

## Related

- ADR 0013 — the `View` / `CmsView` distinction the key endpoint uses.
- ADR 0019 — HLS keys as non-replicated, permission-gated sidecars.
