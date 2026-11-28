# #2690 iOS screenshots

Taken on 2026-11-27 on an iPhone 13 Pro (1170×2532, light theme) from the build of `luminary` 409e6bf7 and
`luminary-deployment` 37cab77, with the downloads test flag on. Scaled to 1200 px high. Data is the dev environment's.

The file names match `../android/`, so each screen can be compared with its pair. Two have no iOS pair:
`31-wizard-step2-camera` (the item had one camera, so the step was skipped) and `36-wizard-step6-save-to` (iPhones
have no SD card). Because the camera step was skipped, the iOS wizard shows four steps, not six.

The content tiles in 04 and 05 show a prototype of the design's arrow mark that is not committed; the committed tiles
show the yellow tick.

Delete this folder once #2690 ships.

| File | Shows |
|---|---|
| [01-my-downloads.png](01-my-downloads.png) | My Downloads: interrupted banner, sort chips, Select, cards for complete downloads |
| [02-my-downloads-partial-and-storage.png](02-my-downloads-partial-and-storage.png) | My Downloads scrolled: a waiting-for-Wi-Fi card, an audio card, storage panel |
| [03-my-downloads-card-paused.png](03-my-downloads-card-paused.png) | A card paused mid-download: Resume / Stop downloading, progress bar |
| [04-play-page-all.png](04-play-page-all.png) | Play page, All: downloaded items carry the mark (prototype) |
| [05-play-page-downloaded-only.png](05-play-page-downloaded-only.png) | Play page, Downloaded only: downloaded, downloading and needs-attention marks |
| [10-reopened-sheet-downloaded.png](10-reopened-sheet-downloaded.png) | Download sheet reopened on a partial download: heading, title + details, Remove download, chapter ticks |
| [11-reopened-sheet-update-pending.png](11-reopened-sheet-update-pending.png) | A chapter ticked: +size on the row, Update · +size |
| [12-reopened-sheet-paused.png](12-reopened-sheet-paused.png) | Reopened while a chapter is paused: heading names the state, grey mark on the pending chapter |
| [13-reopened-sheet-after-update.png](13-reopened-sheet-after-update.png) | After the added chapter finished: Downloaded, every mark yellow |
| [14-change-asks-download-again.png](14-change-asks-download-again.png) | Change on a download: "Download again?" question |
| [15-remove-download-confirm.png](15-remove-download-confirm.png) | Remove download confirmation |
| [20-now-playing-video-not-downloaded.png](20-now-playing-video-not-downloaded.png) | Now playing, Video, nothing downloaded: plain Download arrow, chapter buttons, Autoplay row |
| [21-now-playing-audio-not-downloaded.png](21-now-playing-audio-not-downloaded.png) | Now playing, Audio mode |
| [22-quality-dropdown.png](22-quality-dropdown.png) | Quality dropdown (compact, nothing beside Auto), Data saver switch |
| [23-chapters-sheet.png](23-chapters-sheet.png) | Chapters sheet with frames, count in the header |
| [24-more-sheet.png](24-more-sheet.png) | More sheet: current item marked, download marks and lines |
| [25-autoplay-drawer.png](25-autoplay-drawer.png) | Autoplay drawer: switch in the title row, Everything / Downloaded only |
| [30-wizard-step1-audio-or-video.png](30-wizard-step1-audio-or-video.png) | Wizard step 1: Audio or video cards, Last used tag, step dots |
| [32-wizard-step3-quality.png](32-wizard-step3-quality.png) | Wizard Video quality step (step 2 of 4 here) with whole-item sizes |
| [33-wizard-step4-language.png](33-wizard-step4-language.png) | Wizard Language step: "Your app language" and "Last used" tags |
| [34-wizard-step5-what-to-download-whole.png](34-wizard-step5-what-to-download-whole.png) | What to download: Whole video / Chapters cards, Whole video picked |
| [35-wizard-step5-what-to-download-chapters.png](35-wizard-step5-what-to-download-chapters.png) | What to download with Chapters picked: All chapters row and per-chapter sizes |
| [40-now-playing-downloading-percent.png](40-now-playing-downloading-percent.png) | Now playing right after starting: percent pill above Download |
| [41-now-playing-downloaded-partial.png](41-now-playing-downloaded-partial.png) | Download finished: Downloaded / Online switch under the title |
| [42-now-playing-playing-download-one-chapter.png](42-now-playing-playing-download-one-chapter.png) | Playing a one-chapter download: chapter buttons shown, previous dimmed, next active |
| [43-sheet-from-player-one-chapter.png](43-sheet-from-player-one-chapter.png) | Download sheet opened from the player on that download |
| [50-mini-player.png](50-mini-player.png) | Mini-player over the content page: "Playing your download", cover not dimmed |
| [60-full-screen-controls.png](60-full-screen-controls.png) | Full-screen controls: chapter buttons, chapter line, tools row |

## Differences found against `../android/`

iOS, to be fixed:

- 12: no progress bar under the details line.
- 40: the Downloaded / Online switch already shows while downloading; the cover shows instead of the picture, and Quality and View are missing from the tools row.
- 20, 42: the chapter line under the title is plain text, not a pill, and is missing while the one-chapter download plays.
- 42: Sleep and AirPlay are missing while the download plays.
- 25: no close button, no highlight on the chosen row, a tray glyph instead of the mark before "Downloaded only".
- 10: no divider under the heading row.
- 22: the time left is cut to "-1:…" while the dropdown is open.

Page:

- 01 (dark theme): "Remove" on the cards is almost invisible.
- 50: the content page's play button shows Play while the mini-player plays.
