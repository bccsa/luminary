# 07 — Encryption keys are not stored encrypted at rest

> **Task:** Encryption keys do not need to be stored encrypted at rest (i.e. no need to use
> `CryptoDto`).

## What the current branch does

`processMediaDto.ts:23`:

```ts
media.hlsKey_id = await storeCryptoData<string>(db, media.hlsKey);
```

`storeCryptoData` (`api/src/util/encryption.ts:125`) AES-256-CBC-encrypts the value under a key
derived by `scrypt` from the `ENCRYPTION_KEY` environment variable, and writes a `CryptoDto`:

```ts
const storageDoc = new CryptoDto();
storageDoc.type = DocType.Crypto;
storageDoc._id = uuidv4();
storageDoc.data = { encrypted: encryptedData };
```

## Why that is the wrong tool here

`CryptoDto` exists for **server-only secrets** — specifically S3 credentials
(`StorageDto.credential_id`, decrypted server-side in `s3.service.ts:82` and
`encoderConfig.controller.ts:99`). Its properties are exactly wrong for a client-delivered key:

| `CryptoDto` property | Effect on an HLS key |
|---|---|
| No `memberOf` | Cannot be permission-gated per group; nothing to check `verifyAccess` against |
| Encrypted under one server-wide `ENCRYPTION_KEY` | Every read costs a decrypt, and the API must hold the plaintext to serve it |
| Rotation not automated | `CLAUDE.md`: *"rotation is not yet automated — don't store anything irrecoverable."* A lost `ENCRYPTION_KEY` would make every encrypted video permanently unplayable, including for the CMS editors who could otherwise re-enter the key |
| Serving requires decrypt-then-respond | The plaintext key exists in API memory and in the response body on every request |

The third row is the decisive one. Encrypting at rest converts a *recoverable* problem (a key
document is lost → re-run the encoder or re-enter the key) into an *unrecoverable* one (the
`ENCRYPTION_KEY` is lost → the entire encrypted media library is dead). For a value that is
delivered to any authorised client on request, that risk buys almost nothing.

## What replaces it

Nothing, at rest. The protections are:

1. **Access control** — `/sidecar` checks `View` on the parent's `memberOf`
   ([02](02-sidecar-rest-endpoint.md)).
2. **No bulk extraction** — sidecars are excluded from `/query`, `/fts`, sync and socket rooms
   ([08](08-query-api-exclusion.md)). One key per authorised request, no listing primitive.
3. **Masking** — the key is XOR-masked so it never appears verbatim in the document, a log, or a
   proxy cache ([06](06-key-masking.md)). Obscurity, explicitly not encryption.
4. **Transport** — TLS, same as every other endpoint.

The honest summary for the ADR: *an HLS key is a value we hand to anyone allowed to watch the
video. Protecting it from those people is not achievable; protecting it from everyone else is what
the permission check and the absence of a bulk read path do. Encryption at rest would defend only
against an attacker who already has raw CouchDB access — who, in this system, could also read the
`ENCRYPTION_KEY` from the API's environment.*

## `CryptoDto` stays

Do **not** remove `CryptoDto`, `storeCryptoData`, `retrieveCryptoData`, or `util/encryption.ts`.
They remain in use for S3 credentials:

- `api/src/s3/s3.service.ts:82`
- `api/src/endpoints/encoderConfig.controller.ts:99`
- `api/src/changeRequests/documentProcessing/processStorageDto.ts`

The `crypto` doc type also keeps its `/query` block (`query.service.ts:107`) — the sidecar
exclusion is added **alongside** it, not instead of it ([08](08-query-api-exclusion.md)).

## Migration of existing data — none needed

**Decided: 1878 has not been deployed anywhere.** No production or staging database contains an
HLS key as a crypto document, so there is nothing to migrate.

That means:

- **No schema upgrade.** Do not add a `db/schemaUpgrade/vN.ts` and do not touch `db.upgrade.ts`.
- **Delete the code path outright** rather than deprecating it — the `storeCryptoData` call in
  `processMediaDto.ts:23` and the `retrieveCryptoData` assertion in `processMediaDto.spec.ts:35`
  both go.
- **Check the seeding docs.** `api/src/db/seedingDocs/*.json` are applied by `npm run seed` and are
  the starting state for tests (`api/CLAUDE.md`: *"tests start at the seeded version and do not run
  upgrades — seeding data must already be in the latest schema"*). If any seeded Post/Tag carries a
  `media.hlsKey_id`, update it in the same commit — a stale one would leave tests asserting against
  a document shape the code no longer produces. (Checked while writing this doc: no seeding file
  currently mentions `hlsKey` or `hlsKey_id`, so this is expected to be a no-op — re-check at
  implementation time in case the 1878 work adds one.)
- **Local dev databases** may hold junk from manual testing on this branch. Orphaned crypto docs
  there are inert and unreachable; recreate the database if it bothers you. Not worth automating.

This is the cheapest possible answer and the reason it is worth doing the cutover now rather than
after 1878 ships.

## Files to touch

| File | Change |
|---|---|
| `api/src/changeRequests/documentProcessing/processMediaDto.ts` | drop `storeCryptoData`; write a sidecar ([04](04-hls-key-as-sidecar.md)) |
| `api/src/changeRequests/documentProcessing/processMediaDto.spec.ts` | the `retrieveCryptoData` assertion at line 35 becomes a sidecar read |
| `api/src/db/seedingDocs/*.json` | only if any seeded doc carries `media.hlsKey_id` — grep first |
| `docs/adr/0018-*.md` | record the "not encrypted at rest" decision and its reasoning |

## Tests

- Storing a key writes a `sidecar` document and **no** `crypto` document.
- The stored payload is masked, not plaintext, and not the AES-256-CBC envelope shape
  (`data.encrypted` absent).
- S3 credential storage still round-trips through `CryptoDto` unchanged — a regression guard that
  this change did not overreach.

## Related

[06 key masking](06-key-masking.md) · [08 query exclusion](08-query-api-exclusion.md) ·
[04 HLS key as a sidecar](04-hls-key-as-sidecar.md)
