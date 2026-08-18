# 06 — Key masking

> **Task:** Implement key masking in the same way `luminary-media-convert` does it. (Stored masked?)

> **Build this first.** Despite the number, this is step 1 of the
> [implementation order](README.md#implementation-order): it has no dependencies — pure functions,
> no database, tests anyone can run — and nothing downstream can store a key correctly until it
> exists. Sequencing it after the write path or the endpoint would ship a window in which keys are
> stored and served unmasked.

## How the encoder does it

Already implemented on this branch, in `cms/src/util/mediaEncoder.ts:145`:

```
mask = SHA-256(sessionId)[0..15]
key  = masked XOR mask            (XOR is its own inverse)
```

```ts
/** XOR the masked key with SHA-256(sessionId)[0..15]. Self-inverse. */
export async function unmaskKeyHex(sessionId: string, maskedKeyHex: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
    const mask = new Uint8Array(digest).subarray(0, 16);

    const masked = new Uint8Array(maskedKeyHex.length >> 1);
    for (let i = 0; i < masked.length; i++) {
        masked[i] = parseInt(maskedKeyHex.substring(i * 2, i * 2 + 2), 16);
    }

    return Array.from(masked, (byte, i) =>
        (byte ^ mask[i % mask.length]).toString(16).padStart(2, "0"),
    ).join("");
}
```

The doc comment above it states the threat model plainly, and it is worth repeating here because it
governs every decision below:

> This keeps raw keys out of logs and proxies. **It is obscurity, not DRM**, and the encoder
> documents it as such.

The mask seed is the session ID — a value the key's legitimate holder already has. The mask is not
a secret; it is a guarantee that the AES key never appears verbatim in a JSON body, a log line, an
access log, or a proxy cache.

## Answer to "stored masked?" — yes

Mask on the way in, store masked, serve masked, unmask in the client. The API never holds a
plaintext key beyond the few statements in `processMedia` that receive and mask it.

Consequences, stated so nobody is surprised later:

- A CouchDB dump, a `_all_docs` scrape by someone with DB access, or a backup file contains no
  literal AES key.
- The server can't accidentally log one — there is nothing to log.
- It is **not** encryption at rest. Anyone who can read the sidecar can also derive the mask (the
  seed is public). It raises the cost of casual extraction, nothing more. [07](07-no-encryption-at-rest.md)
  explains why that is the accepted position for this data.

## Choosing the mask seed

The encoder uses its session ID. We have no session, so the seed must be something the authorised
client already holds, is stable for the lifetime of the key, and is unique per key.

**Decided: the sidecar `_id`, derived — not stored.** There is no `maskSeed` field on the document.

| Candidate | Verdict |
|---|---|
| **Sidecar `_id`** | **Chosen.** Unique per key, stable, and returned in the `/sidecar` response body ([02](02-sidecar-rest-endpoint.md)) so the client always has it. |
| `parentId` | Works, but with deterministic sidecar IDs it is a substring of `_id` anyway, and it would make two keys for the same parent share a mask. |
| A random `maskSeed` stored on the sidecar | Pointless — a seed stored next to the value it masks adds a field and no obscurity. |
| The encoder's `sessionId` | Not durable. The session is gone by the time the app plays the video, and the app never knew it. |

With deterministic IDs, `_id` is `sidecar-<parentId>-hlsEncryptionKey` — a low-entropy, guessable
string. That is fine, and it is worth being explicit about why: **the mask's value does not depend
on seed secrecy.** It defends against a key appearing verbatim somewhere it shouldn't (a log, a
proxy cache, a database dump), and anyone who can read the sidecar document can derive the mask
regardless of how the seed is chosen. Choosing a high-entropy seed would add a field and buy
nothing.

## Where the code lives

**In scope: `api/` only.** Add `api/src/util/maskKey.ts` using Node's `createHash("sha256")`. That
is all this ticket needs — the API masks on write, and the endpoint serves the masked value.

Because XOR is self-inverse, mask and unmask are the same function, so one export covers both
directions.

The API cannot import from `shared` (it is not a dependency of `api/`), so the browser-side
`unmaskKeyHex` in `cms/src/util/mediaEncoder.ts:178` and this new Node function are a deliberate,
documented duplication — the same situation as the FTS config that `CLAUDE.md` calls out.
**Cross-reference the two files in comments on both sides**, and give the API's version a test
vector identical to one in `cms/src/util/mediaEncoder.spec.ts` so a divergence fails a test rather
than a video.

A ready-made starting point: `cms/src/util/mediaEncoder.spec.ts:11` already contains an independent
Node implementation, written for that test:

```ts
function maskKey(sessionId: string, keyHex: string): string {
    const mask = createHash("sha256").update(sessionId).digest().subarray(0, 16);
    …
}
```

That is very nearly the API-side function already. Lift it into `api/src/util/maskKey.ts` rather
than writing a third variant.

**Out of scope, noted for later:** when the app player is built, `unmaskKeyHex` should move from
`cms/src/util/mediaEncoder.ts` to `shared/src/util/maskKey.ts` so `app` and `cms` share one browser
copy instead of two. Not needed now — the CMS's copy works, and moving it is front-end churn this
ticket does not require.

## Validation

`isHlsEncryptionKeyData` ([01](01-generic-sidecar-service.md)) enforces
`/^[0-9a-f]{32}$/` — 16 bytes, hex, lower case. AES-128 is what HLS uses and what the encoder
produces. Reject anything else at write time so a malformed key is a change-request warning rather
than a silent playback failure days later.

Consider also validating the *incoming* `media.hlsKey` with the same regex in `MediaDto`
(`@Matches(/^[0-9a-f]{32}$/i)`), so a typo in the CMS key field is caught at the edge with a clear
message. The CMS test at `EditContentVideo.spec.ts:69` currently sets a 16-character value
(`"0123456789abcdef"`), which such a rule would reject — that fixture would need updating, and it
is worth checking whether the CMS field is actually meant to accept short keys before tightening.

## Threat-model note for the ADR

Worth recording explicitly, because "we mask the keys" invites over-reading:

- The HLS key protects the media segments, not the sidecar. Anyone entitled to play the video is
  entitled to the key.
- Masking defends against **incidental** exposure: logs, proxy caches, DB dumps, screenshots of a
  JSON response.
- It does **not** defend against an authorised client redistributing the key. Nothing in an
  offline-first architecture can.
- The real access control is the permission check on `/sidecar` ([02](02-sidecar-rest-endpoint.md))
  and the impossibility of bulk extraction ([08](08-query-api-exclusion.md)).

## Files to create / touch

| File | Change |
|---|---|
| `api/src/util/maskKey.ts` (+ spec) | new Node implementation, cross-referenced to the CMS copy |
| `api/src/sidecar/hlsEncryptionKey.ts` | hex guard for `maskedKeyHex`; masks on write |
| `api/src/dto/MediaDto.ts` | optionally `@Matches` on the incoming `hlsKey` (see Validation) |

Not touched: `shared/`, `cms/`, `app/` — see "out of scope" above.

## Tests

Pure functions, no DB — runnable by anyone, unlike most of this feature's tests.

- Round-trip: `mask(seed, mask(seed, key)) === key` (self-inverse), mirroring
  `mediaEncoder.spec.ts:29`.
- **Shared test vector:** a fixed `(seed, key)` pair whose masked output is asserted as a literal,
  with the same literal asserted in `cms/src/util/mediaEncoder.spec.ts`. This is what catches a
  divergence between the two implementations, and it is the reason to write the vector down rather
  than only round-tripping.
- A different seed does not recover the key (`mediaEncoder.spec.ts:39`).
- Output length is preserved (`mediaEncoder.spec.ts:47`).

## Related

[01 generic sidecar service](01-generic-sidecar-service.md) ·
[04 HLS key as a sidecar](04-hls-key-as-sidecar.md) ·
[07 no encryption at rest](07-no-encryption-at-rest.md)
