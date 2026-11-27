# #2690 iOS alignment handoff

For a fresh Claude session: compare the iOS player and downloads screens with Android and make iOS match.
**Android is the source of truth.** Where iOS differs, change iOS; don't change Android.

## Where things are

- Android screenshots and what each shows: [android/README.md](android/README.md) (this folder).
- Branch `2690-app-downloads-and-player-experience-overhaul` in both repos:
  - `/Users/dirk/Work/bccsa/luminary/luminary` (web app: `app/src/media-player`, `app/src/downloads`).
  - `/Users/dirk/Work/bccsa/luminary/luminary-deployment` (native: `luminary-plugins/player-native/android` and `.../ios`).
- Both repos have CodeGraph indexes; use `codegraph_explore` with `projectPath` set to the repo.
- Build both devices from Terminal: `/Users/dirk/Desktop/build-2690-ios-android.command`
  (builds the web bundle with `VITE_DOWNLOADS_VIEW_IS_ENOUGH=true`, `cap sync`, the iOS simulator app and the Android debug APK).
  The local iOS bundle id is `com.dirk.luminarytest`.

## How to compare

1. Open each Android screenshot and get the iOS simulator to the same state (same item, same mode).
2. Note every difference: layout, spacing, copy, colours, which controls show, disabled states, what a tap does.
3. Fix iOS to match. Port the Android logic (Kotlin under `android/src/main/java/org/bccsa/luminary/`) to the
   Swift counterpart (`ios/Sources/LuminaryPlayerCore` for rules, `ios/Sources/LuminaryPlayerUI` for views).
4. Re-run the iOS core tests (`ios/Tests/Core`) and keep them passing.

## Latest round (shots 70–73): already ported to iOS but not yet checked on the simulator

| Behaviour | Android | iOS |
|---|---|---|
| Audio/Video toggle shows whenever the page says it can switch (`canSwitch`), downloads included; hidden only for sound-only content | `NowPlayingRules.audioVideoShown` | `NowPlayingDownloads.showsModeSwitch` |
| Video on a sound-only download (`screen.videoFrom == stream`) asks first in a centred card; Cancel keeps Audio | `NowPlayingView.askVideoStream`, `sheet/QuestionCard.kt` | `NowPlayingViewController.switchPicked` / `ask`, `LuminaryPlayerUI/QuestionCard.swift` |
| Strict data saver ask uses the same card | `askStrictVideo` | `ask` |
| Offline (`videoFrom == unavailable`): Video side dimmed (≈30 % ink), taps ignored | `SegmentSwitch.videoEnabled` in `NowPlayingWidgets.kt` | `SegmentSwitch.videoEnabled` in `NowPlayingWidgets.swift` |
| Full-screen: a tap on the timeline never seeks; it opens the filmstrip at the playhead (videos with thumbnails) | `SkinControls.timelineTapped` | `FullscreenViewController` timeline tap |

Card texts come from the page (`media_player.video_stream_title/description/confirm`); the native fallbacks are in
`NowPlayingTexts` on both sides.

To reproduce 70–73: play an item whose **sound only** is downloaded (the dev data has "Saturday youth meeting"),
open it in Downloaded mode, press Video (71), Watch online (72); for 73 turn the network off
(`xcrun simctl` has no network switch: use the Mac's Wi-Fi or Network Link Conditioner) and reopen in Downloaded.
The page only offers Video offline for items it has seen online with video (`app/src/downloads/videoParents.ts`),
so open the item once online first.

## Rules

- Don't commit `luminary-deployment/luminary/app/src/downloads/deps.ts` (local test flag).
- Don't run Playwright / E2E suites.
- The submodule `luminary-deployment/luminary` is a build copy; app changes go in the `luminary` repo and the
  pointer is bumped in `luminary-deployment`.
- Commit and push only when the user asks.
