# Temporary: #2690 downloads and player UI, context for implementers

Working context for bccsa/luminary#2690 (downloads and player experience overhaul).
**Delete this whole folder once the implementation is done**, before the work merges into `main`. Never link to it
from code, tests or JSDoc.

## The design

The UI proposal is approved. **`offline-downloads-ui.html` is the source of truth**: open it in a browser and read
the yellow note next to each board first. Those notes hold the rules you cannot see in the pictures. Boards are
numbered in reading order. Boards with the same number are states of one screen. Dark boards show dark mode, not
separate screens. Titles, sizes and languages are samples: real sizes come from the playlist and the engine.

The PNGs in this folder are earlier drafts. Where they disagree with the HTML, the HTML wins. For example, the tile
mark sits in the picture's top-right corner, not under the title.

## Read before you start

- `CLAUDE.md` (repo root) and `app/CLAUDE.md`: commands, conventions, comment style, `temp_` docs.
- `app/docs/temp_downloads-app-design.md`: how the downloads service, the engine contract, the fake engine and the
  player integration fit together, and where the UI hooks in. Build on that structure. Do not route around it.
- `app/src/build-time/contracts/downloads/contract.ts`: `DownloadsService` (what components inject), `DownloadsEngine`
  (what a platform supplies), and the sheet model and actions.
- Work spans two repos on the same branch name: `luminary` (app) and `luminary-deployment` (native plugins in
  `luminary-plugins/player-native`). Check both are on the branch before you start.

## Board to code

| Board                        | What                                                                         | Where                                                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Mark                       | One down-arrow mark, five states                                             | `app/src/downloads/ui/DownloadBadge.vue`, `app/src/downloads/badges.ts`. The native now-playing screen gets the same states as `download.badge`                                                                                                                            |
| 2 Tiles                      | Mark in the picture's top-right corner, tile keeps its size                  | `ContentTile.vue`, `ReadMore.vue`, `MediaPlayerUpNext.vue`, `SearchPanel.vue`, through `service.ui.DownloadBadge`                                                                                                                                                          |
| 3 Player                     | Downloaded/Online switch, Audio/Video, offline badge                         | `app/src/media-player/MediaPlayer.vue`, `MediaPlayerWrapper.vue`, the in-page player in `app/src/media-player/player/`, and the native now-playing screen in `luminary-deployment/luminary-plugins/player-native` (Android `.../player`, iOS `LuminaryPlayerPlugin.swift`) |
| 4 Download button, More list | One label, the icon changes; the mark at the end of each row                 | Player download tool (`VideoNowPlayingDownload`), up-next items' `downloaded` flag                                                                                                                                                                                         |
| 5 Downloads page             | Cards, storage lines per volume, floating mini-player                        | `app/src/downloads/ui/DownloadsPage.vue`, `DownloadCard.vue`, `StorageCard.vue`, `ResumeBanner.vue`, status text in `app/src/downloads/entries.ts` and `page.ts`                                                                                                           |
| 6 Watch page, offline        | All/Downloaded pills; media fades with "Needs internet"; text stays readable | `VideoPage.vue`, `PinnedVideo.vue`, `UnpinnedVideo.vue`, `app/src/downloads/ui/WatchFilterSwitch.vue`, the single-content page for the video placeholder                                                                                                                   |
| 7 Player menus               | Autoplay menu, audio quality, chapters popup                                 | `AutoplayModePill.vue`, `app/src/media-player/autoplayMode.ts`, `useNextUp.ts`, the web player and the native player menus                                                                                                                                                 |
| 8 Problems, empty, iPhone    | One message and one fix per reason                                           | `entries.ts` (reason to message), `DownloadCard.vue`, `DownloadsPage.vue` empty state                                                                                                                                                                                      |
| 9 Download wizard            | One step per question, tap to move on, reopened sheet                        | The sheet is **native**: Android `player-native/android/.../downloads/sheet/` and `DownloadSheetRules.kt`, iOS `LuminaryDownloadsPlugin.swift`. The app builds its model in `app/src/downloads/sheet.ts` (`DownloadSheetModel` / `DownloadSheetAction` in the contract)    |
| 10 Move to phone or SD card  | Select, Move, choose a place                                                 | New. The engine contract has no move yet: add it to `DownloadsEngine`, the fake engine and the native plugin (`StorageVolumes.kt`) together                                                                                                                                |

## Rules that apply everywhere

- Colours are the app's Tailwind colours: accent `yellow-500` (#eab308), text on yellow #422006, red #dc2626. Use one SVG
  for the mark in every state. It comes in four sizes: 18 px on pictures, 16 px inline, 20 px at the end of rows and
  24 px on the player button.
- A partial download is said in text ("3 of 8 chapters"), not shown with its own look.
- No choice, no button. A control with one option (quality, language, angle, storage place) is hidden, and the
  remaining buttons spread out.
- Waiting for the network, metered data and a pause the viewer chose are not problems. They are never shown in red.
- Offline, nothing is hidden. Media that cannot play fades with "Needs internet". Items with text stay at full strength
  and say what is missing in place.
- The download sheet and the chapters popup share the same handle, drag-to-close and left-aligned heading.
- Web and mobile web have no downloads. Render nothing of downloads when the service is not injected.
- UI strings go in `api/src/db/seedingDocs/lang-eng.json` and `lang-fra.json`. Do not hard-code English in components.

## How to build and check

- Start in the browser with the fake engine: `npm run dev` in `app/`, then open the app with the `fakeDownloads` query
  flag (DEV only). Its debug panel drives the states: failures, network, free space, SD card mounted.
- The native sheet and the native now-playing screen only exist in the Android and iOS builds. Player changes land on
  web, Android and iOS, compared side by side.
- Put each finished screen next to its board in the HTML, in light and dark mode, before calling the board done.
- Unit tests: `npm run test -- src/downloads` in `app/`. Check formatting with `npx prettier --check` on the changed
  files. Playwright and E2E runs are run by the user only.

## Files

| File                                                             | Shows                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| `offline-downloads-ui.html`                                      | **The approved design**: all boards with their notes |
| `01-downloaded-indicator.png` … `09-player-downloaded-light.png` | Earlier drafts, for reference only                   |
