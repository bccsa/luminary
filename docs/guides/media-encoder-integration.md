# Luminary Media Convert integration

How a CMS editor turns a local video file into an HLS collection, what is finished, and
— the point of this document — **what is temporary and has to come out.**

The encoder is a separate desktop application
([bccsa/luminary-media-convert](https://github.com/bccsa/luminary-media-convert)). It runs on
the editor's own machine, listens on loopback, and uploads to S3 itself. Nothing is
uploaded through this API.

## The flow today

1. **Encode** in the Media section of a post or tag ([`EncodeMediaButton.vue`](../../cms/src/components/media/EncodeMediaButton.vue)).
   A health check against `http://127.0.0.1:31711/api/cms/health` decides whether the button
   appears or a `luminary-convert://` launch link does.
2. The CMS fetches the bucket's S3 credentials from **`GET /storage/encoderconfig`**
   ([`encoderConfig.controller.ts`](../../api/src/endpoints/encoderConfig.controller.ts)).
   Gated on `AclPermission.Assign` for the bucket — assigning a bucket is the right to publish
   into it, which is what these credentials confer. Credentials are stored encrypted and are
   never replicated to clients, which is why they are fetched rather than read off the Storage
   document the CMS already holds.
3. **`POST /api/cms/sessions`** on the encoder, authorised by browser `Origin`, not a key. The
   first request from a new origin raises a native trust dialog in the desktop app. Chrome only:
   reaching `127.0.0.1` from a public origin is a private-network request and other browsers do
   not implement the grant.
4. The encoder brings its window forward and the editor picks a file.
5. The CMS follows the session over SSE and, on the **first `encoding` event**, writes
   `media.hlsUrl` to the document — the destination is settled when encoding starts, so an
   editor can save and move on while a long encode runs. The URL 404s until the first segments
   land.
6. On save, the API turns a submitted `media.hlsKey` into a crypto object and keeps only
   `hlsKey_id` ([`processMediaDto.ts`](../../api/src/changeRequests/documentProcessing/processMediaDto.ts)),
   so a key never rests in plain text on a content document.

`media.hlsUrl` and `media.hlsKey` are also editable by hand in the Video section, and are the
same fields the encoder writes — so a hand-entered collection and an encoded one are
indistinguishable downstream.

## The player, and what adopting it retired

The app and the CMS play HLS through `LuminaryPlayer` from the encoder's
`player-web-legacy` package — Video.js 8 over the shared `player-core` pipeline. It
decrypts LMCENC playlists before the engine sees them and serves the AES key from
memory for the `luminary://key` sentinel, which is what makes an encrypted
collection playable at all. `player-web-legacy` rather than `player-web` (the hls.js
build) because it reproduces the chrome the app already drew, so the swap was
invisible to viewers.

Encryption is requested on every session (`encryption: { required: true }` in
[`useMediaEncoder.ts`](../../cms/src/composables/useMediaEncoder.ts)). The CMS states
a *requirement*; the encoder still generates and holds the key, and delivers it to
entitled callers through the sidecar endpoint — see
[ADR 0019](../adr/0019-hls-encryption-keys-as-non-replicated-sidecars.md).

Three workarounds existed while the old player could not read encrypted output. Two
are gone:

| # | What it was | Status |
|---|-------------|--------|
| 1 | `encryption: { required: false }` on every session, so output was plaintext | **Removed.** Encryption is requested again, and pinned by a test so it cannot drift back unnoticed. |
| 2 | Player debug logging behind `?playerdebug=true` | **Removed** with the player swap; the old `VideoPlayer.vue` that carried it is gone. |
| 3 | **Plaintext shim objects in S3** — prefixes ending `-plaintext/` holding decrypted playlists **and a published `key.bin`** | **Outstanding, outside this repo.** See below. |

### Item 3 — the published keys

Publishing a decryption key as a public object beside the video makes the encryption
decorative, which is precisely what the encoder refuses to do by design. These were
written by hand for two collections encoded before item 1 was in place, and the
practice must not be reproduced — no new collection needs it.

They live in a media bucket rather than in this repository, so removing them is a
bucket operation someone with access has to perform: **delete any prefix ending
`-plaintext/`, and confirm no `key.bin` remains published anywhere in the media
buckets.** It was believed to be local-dev only; that belief has not been verified
against the real buckets, and until it is, this stays open.

## Not done yet

- **Edit mode.** `existingMedia { hlsUrl, hlsKey }` is accepted by the encoder and ignored, so
  every encode produces a new collection in its own folder. Adding one audio language means
  re-encoding everything.
- **Stale collections.** Nothing deletes a superseded collection, and deleting a document leaves
  its collection in the bucket — the encoder writes it and nothing here tracks which objects
  belong to it.
- **Per-language audio is gone.** The upload path, the fields (`media.fileCollections`,
  `media.uploadData`) and the app's audio player were all withdrawn. `media` now carries an
  HLS collection or nothing. Existing documents keep the dead fields until their next save,
  when change-request whitelisting drops them — nothing reads them in the meantime.

## Testing on dev from a Windows machine

The encoder runs on the tester's machine, so "deploy to dev" only covers the API and CMS.

- Install the encoder on the Windows machine and leave it running — the CMS defaults to
  `http://127.0.0.1:31711`, which is the port the packaged app binds. `VITE_ENCODER_URL`
  overrides it, and is only needed when running the encoder's API standalone from source
  (port 3000).
- Use **Chrome**. Private-network access is Chrome-only at the time of writing.
- An HTTPS dev CMS reaching `http://127.0.0.1` is not blocked as mixed content — browsers treat
  loopback as potentially trustworthy — but the first request raises the encoder's native trust
  dialog for the dev origin. Accept it once.
- The dev API needs `GET /storage/encoderconfig`, and the media bucket needs a `publicUrl` and
  credentials with write access.
- The dev bucket needs CORS allowing the app and CMS origins, including the `Range` header —
  byte-range HLS depends on it.
