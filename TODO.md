# TODO: reports from 23–26 October 2026

The bugs and requests Ivan and Dirk reported in the Luminary | Development group
since Omi started logging them (23 October), as tickets in this repo. All are in
**To triage** on the board except #2334 (In progress).

**Fix in** says where the change goes:

- **app**, **cms**, **server**: this repo, or data on the server.
- **player**: the player packages in `luminary-media-convert` (its own `TODO.md` on
  the `todo/weekend-reports` branch lists that side).

**iOS** is from a code check on 24 October; "–" means not checked.

## Media player: bugs

| Done | Ticket       | What                                                                                                                                                                                                                                        | Fix in       | iOS          |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| [ ]  | #2316, #2328 | Raw keys instead of text (`media_player.up_next`, `media_player.in_series`…). The server's language documents are missing 74 of the 180 strings the app uses: 39 `media_player`, 26 `video_player`, 5 `youtube`, 4 `settings`.              | server       | yes          |
| [x]  | #2318        | Up next shows once 60 s or less are left, so from 0:16 on a 1:16 video. It should only show at the end. **Fixed in luminary-media-convert#315: last 10 s.**                                                                                                                                     | player       | yes          |
| [x]  | #2319        | Fullscreen filmstrip is too tall: about half, still at the bottom. Added on 26 Oct: a tap opens the filmstrip instead of seeking, seeking only while scrubbing the expanded view, and with no thumbnails the first tap shows a thicker bar. **Fixed: height in luminary-media-convert#316, two touches in luminary-media-convert#317 and #2340.** | player       | yes          |
| [x]  | #2333        | The audio menu lists a non-existent `audio-0` track, in audio mode only. **Fixed in luminary-media-convert#318 (Android only).**                                                                                                                                                                    | app / player | –            |
| [x]  | #2317        | The subtitle choice is not remembered from one video to the next. Android does not reset its last subtitle report between videos, so a late "off" overwrites the saved choice. **Fixed in luminary-media-convert#321 (all platforms).** | player       | probably not |
| [ ]  | #2326        | A thin line shows at the bottom of the player, as if an overlay does not fully cover it.                                                                                                                                                    | app / player | –            |
| [x]  | #2322        | Grey boxes instead of fallback pictures in Up next. **Fixed in luminary-media-convert#325: the browse panel, on every platform.**                                                                                                                     | player       | no           |
| [x]  | #2331        | The Android lock screen shows "Unknown" as the artist: use the post's author, or hide it. **Fixed in luminary-media-convert#327: an empty artist.** | app / player | –            |
| [x]  | #2344        | Subtitles under the picture fall on the content title on mobile web (Johan, 26 Oct). **Fixed in luminary-media-convert#326 and #2348: a band under the picture, as in the apps.** | app / player | no           |
| [x]  | #2320        | Play/pause looks different in portrait (light disc) and fullscreen (dark disc). Ivan prefers the fullscreen one: confirm before restyling. **Fixed in luminary-media-convert#328: the full-screen icons.** | app          | yes          |

## Media player: improvements

| Done | Ticket | What                                                                                                                    | Fix in       |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------ |
| [ ]  | #2334  | Battery: Active Christianity at 20.7% of use on Android (In progress).                                                  | app / player |
| [ ]  | #2335  | Save playback progress while the app is in the background, for the app to pick up when it wakes.                        | app / player |
| [ ]  | #2332  | A Data Saver override in the quality menu, defaulting to the setting, with a hint that the default comes from Settings. | app          |
| [ ]  | #2327  | Video angles, as the encoder's extended HLS defines them.                                                               | app / player |
| [x]  | #2325  | Check thumbnails cover the whole video in the new player (see #2274). **Checked: the player shows all a file has; short files predate luminary-media-convert#313 (in 0.0.5). Re-encode old videos.** | app          |

## YouTube

| Done | Ticket | What                                                                                                                                                | Fix in      |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [ ]  | #2323  | Black video on web: needs a browser test with the console open.                                                                                     | app         |
| [ ]  | #2126  | Fails on Android (new report on this ticket). Check the build sets `VITE_WEB_ORIGIN` and the site serves `youtube-embed.html`; iOS shares the code. | app / build |

## App

| Done | Ticket | What                                                                                                                         | Fix in        |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------- |
| [x]  | #2321  | White flash when coming back to the app: Android's web view defaults to white. Set a background colour in the native config. **Fixed in luminary-deployment#121: the splash follows the app's theme.** | native config |
| [ ]  | #2324  | Dates follow the post's language rather than the user's (to be discussed).                                                   | app           |

## CMS

| Done | Ticket | What                                                           | Fix in |
| ---- | ------ | -------------------------------------------------------------- | ------ |
| [ ]  | #2330  | A dedicated button to delete a video.                          | cms    |
| [ ]  | #2329  | Check that deleting the video works when its link has changed. | cms    |

## Encoder (logged here)

| Done | Ticket | What                                                                                                                                              |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | #2274  | Thumbnails only cover the start of the video (new report: a 37-minute video with frames only near the start). **Fixed in luminary-media-convert#313.** |
