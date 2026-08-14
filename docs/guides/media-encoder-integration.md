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

## Temporary — remove when `player-web` is adopted

The app plays HLS with video.js / hls.js. That player cannot read an **encrypted** collection:
the playlists are LMCENC-encrypted (so it receives ciphertext on an HTTP 200 and fails parsing
the master) and `#EXT-X-KEY` names the `luminary://key` sentinel, which a browser cannot fetch.
Decryption has to happen before hls.js sees the bytes, which is what `player-core` adds.

Everything in this section exists only because that integration has not happened yet.

| # | What | Where | Remove by |
|---|------|-------|-----------|
| 1 | **Encryption is not requested.** `encryption: { required: false }` on every session, so output is plaintext and the current player can read it. | [`useMediaEncoder.ts`](../../cms/src/composables/useMediaEncoder.ts) | Setting it back to `{ required: true }` |
| 2 | **Player debug logging**, behind `?playerdebug=true`. | [`VideoPlayer.vue`](../../app/src/components/content/VideoPlayer.vue) | Deleting the block |
| 3 | **Plaintext shim objects in S3.** Prefixes ending `-plaintext/` holding decrypted playlists **and a published `key.bin`**. Written by hand for two collections encoded before item 1 was in place. | The media bucket, not this repo | Deleting those prefixes |

**Item 3 is the one to be uncomfortable about.** Publishing the decryption key as a public
object beside the video makes the encryption decorative — precisely what the encoder refuses to
do by design. It exists only so two already-encrypted test collections could be played, it was
never applied to anything but local dev, and it must not be reproduced. With item 1 in place no
new collection needs it.

Also temporary in the sense that `player-core` replaces the code, though both are genuine bug
fixes worth keeping until then:

- **All audio tracks disabled when none matches the app language** — `setAudioTrackLanguage`
  disabled tracks as it walked the list, so an encode whose audio groups are quality tiers
  (`HD`, `Standard`, `Bandwidth Saving`, no `LANGUAGE` attribute) left the stream with no audio
  rendition. Playback stalled a few seconds in and the stall handler looped. Now the choice is
  made first (`pickAudioTrack`) and no match leaves the player's own selection alone.
- **Audio-only master built with one variant per track** instead of one per group, so several
  renditions of one group each became a variant while all still named that group — the player
  played a variant *and* the group's default rendition. Also declared `#EXT-X-VERSION:4` for
  playlists using `#EXT-X-MAP`, which needs 6 or higher. See
  [`extractAndBuildAudioMaster.ts`](../../app/src/components/content/extractAndBuildAudioMaster.ts).

## Blocked on

**`player-web` / `player-core` / `hls` are `private: true` and published to no registry**, so
Luminary cannot depend on them. Open-sourcing them is a prerequisite; the integration itself is
planned with Ivan.

Adopting them removes, in one step: the LMCENC limitation, the published key, the per-encode
shim, and the need to keep encryption switched off. They also bring angle extraction, quality
capping, chapters, subtitles, recovery policy and a "not available yet" state that polls until
the playlist appears.

## Not done yet

- **Edit mode.** `existingMedia { hlsUrl, hlsKey }` is accepted by the encoder and ignored, so
  every encode produces a new collection in its own folder. Adding one audio language means
  re-encoding everything.
- **Stale collections.** Nothing deletes a superseded collection, and deleting a document leaves
  its collection in the bucket — the encoder writes it and nothing here tracks which objects
  belong to it.
- **Uploading media through the CMS is gone.** The API no longer processes `uploadData`, so
  documents keep and play existing audio `fileCollections` but nothing can add more.

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
