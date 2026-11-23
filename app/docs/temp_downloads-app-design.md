# Downloads: how the app side fits together

Working document for downloadable media in the native apps. Delete it, or move its lasting parts into permanent
docs, once the feature has shipped.

The app owns every page-side decision about downloads: who may keep what, for how long, which chapters, and how a
download plays. A build target supplies the engine that stores and plays the bytes. The contract between them is
`src/build-time/contracts/downloads/contract.ts`: `DownloadsEngine` (what a target supplies) and `DownloadsService`
(what consumers inject, under `DownloadsKey` from `token.ts`). The contract is self-contained; nothing in the app
imports a platform package.

## The pieces

| Piece                           | Where                                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract and token              | `src/build-time/contracts/downloads/`         | types only                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| In-app entry                    | `src/build-time/plugins/downloads/index.ts`   | `installDownloads()` provides nothing                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `virtual:downloads`             | `vite-plugins/buildTargetVirtuals.ts`         | an **optional** swappable name: resolves to the implementation directory's `downloads.ts` when that file exists, else to the in-app entry. Its type is `installDownloads(app: App): void \| Promise<void>`: the installer may return a promise, the plugin registry hands it back, and `main.ts` awaits it beside the background-progress wait, capped at 1.5 s so a shell whose plugin never answers still mounts (downloads then arrive for components set up afterwards) |
| `provideDownloads(app, engine)` | `src/build-time/plugins/downloads/provide.ts` | builds the service, adds the `/downloads` route with `router.addRoute`, provides it. The only importer of `src/downloads/**`; an ESLint `no-restricted-imports` rule keeps it so                                                                                                                                                                                                                                                                                            |
| The service                     | `src/downloads/service.ts`                    | reactive state from engine events, badges, eligibility, the sheet, player hooks                                                                                                                                                                                                                                                                                                                                                                                             |
| Lifecycle                       | `src/downloads/lifecycle.ts`                  | access map, expiry, takedown, retention pins, key re-fetch pacing, source checks                                                                                                                                                                                                                                                                                                                                                                                            |
| Badges                          | `src/downloads/badges.ts`                     | the badge rules below, a pure function with its own cases                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Page rules                      | `src/downloads/page.ts`                       | the Downloads page's rules: sort, freed space, card actions                                                                                                                                                                                                                                                                                                                                                                                                                 |
| UI                              | `src/downloads/ui/`                           | `DownloadsPage.vue`, `DownloadCard.vue`, `StorageCard.vue`, `DownloadBadge.vue`, `ResumeBanner.vue`, `MeteredConfirmDialog.vue`, `DeleteLocalDataOption.vue`, `WatchFilterSwitch.vue`, `AutoplayModePill.vue`                                                                                                                                                                                                                                                               |
| Fake engine                     | `src/downloads/fakeEngine.ts`                 | DEV only, below                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Only a native build target imports `provide.ts`, so neither web bundle contains downloads code. Consumers use
`inject(DownloadsKey, undefined)` and render nothing when it is absent. UI is reached only through `service.ui`, as
`VideoPlayerService.component` is. The app has no timeline code of its own: every conversion goes through the
`DownloadTimeline` the engine hands over with a session.

## Service responsibilities

- **State.** At start, `engine.list()` and `engine.storage()` fill `entries`, `progress` and `storage`; `ready` turns
  true. `engine.list()` rejects `io` while stored downloads cannot be read yet (a device not unlocked since it
  started), and the service retries it; every record that joins later arrives as an `entry` event. Then events keep
  them: `entry` replaces one entry, `progress` updates the map, `removed` drops one, `storage` replaces the storage
  report (a card mounted or unmounted, or the preferred volume changed), `playbackReleased` and
  `playbackClosed` clear what is playing and run the source checks deferred for it. No downloads state is
  written to web storage: the engine's manifests are the only record.
- **Badges** by parent id, from the entry, its progress and the volumes (rules below). A tile reads its own badge, so
  a progress tick re-renders only the tiles whose badge changed; `v-memo` on tiles is unaffected.
- **Playable parents.** `playableParentIds` holds the parents whose entry has a done chapter, is not `revoked`, has
  no `missing` key, and whose `volumeId` is mounted in `storage`. The set drives the Watch filter, autoplay's
  downloaded mode, the up-next badge, the sheet's Downloaded source and the player's choice not to warm the stream for
  an item likely to play from the device.
- **Eligibility** (below), as a computed per content.
- **The sheet.** `openSheet` presents it at once in `preparing` (options empty, `selection` the preselection), asks
  `engine.options()` for the choices and sizes, and sends the model (below). The preselection is the existing
  download's selection when there is one; otherwise the `selection` hint of `openSheet`'s options (what plays: kind,
  angle, quality, audio language), with any field the options do not offer ignored. It handles the sheet's actions:
  `start` mints a new download id (`crypto.randomUUID()` without dashes) or reuses the existing one, runs the source
  check first for an existing one, calls `requestNotificationPermission()` before a download starts while none exist,
  and `engine.start()`. When that source check reports `deferredChapters` (the source changed while the download is
  being played), `engine.start()` is **not** called and nothing is held: the viewer is told "This item was updated.
  Stop playing it, then add chapters again." (a notice, below), and the check at session close brings the download up
  to date. `delete`, `cleanUp`, `pause`, `resume`, `remove` and `source` act and send the model again; `source` sets
  the override `player.sourceOverride(parentId)` answers and tells the `player.onSourceChosen` listeners, and fails
  when one answers false; `retry` asks for the options again. When one of those actions fails while the sheet is up,
  the model goes again with `phase: "error"` and the message `downloads.sheet.action_failed` ("That didn't work.
  Please try again."), and Retry rebuilds the model as at opening; the same action failing from the Downloads page
  shows the app's usual error notification: that action's own message where it has one, else
  `downloads.sheet.action_failed`. The model's `freeBytes` is the free space of the existing download's volume, or
  for a new one of `storage.preferredVolumeId` when it is mounted, else of `internal`; `start` passes that volume as
  `volumeId`. Its `existing` lists only the other downloads on that volume, none while no volume is known, since
  deleting a download elsewhere frees nothing there. The model's `download` is the entry's status, reason and
  progress, except for a refreshing entry (badge rule 4), which is sent as `complete` with a null reason and
  progress 1.
- **Notification words** from i18n, with every start and when the language changes (`engine.update` with `texts`).
- **Notification taps.** `notificationTap` routes to `/downloads`, whatever its kind.
- **Player hooks** (`service.player`): which copy to open, the notices when more chapters become ready, the
  viewer's source pick (`onSourceChosen`, `sourceOverride`), and the player's own notice display (`onNotice`).
- **Notices.** Every notice the service gives the viewer goes first to the `player.onNotice` listeners: the player
  registers one that shows the text on its own screen when that screen is showing and returns true. A notice no
  listener showed goes to the app's notifications.
- **Storage**: `refreshStorage()` after every removal and when the Downloads page opens; `storage` events keep the
  volumes' mounted state current in between. `setPreferredVolume` is the location switch on `StorageCard`, shown only
  when `capabilities.volumes` (a constant of the platform: it can keep downloads on a card) and `storage.volumes` has a
  mounted volume of kind `card`; the engine keeps the choice. A card's `label` is the system's name for it; the page
  names the internal volume itself and never shows its `label`.
- **Resume.** `resume(id, { meteredConsent })` and `resumeAll({ meteredConsent })` first do what a `failed` reason
  needs (below), then call `engine.resume` with the consent. Every web-drawn way to resume asks the mobile-data
  question first when `network.metered`, with `MeteredConfirmDialog` ("Use mobile data? This may use about {size}."):
  the Resume button and the "Use mobile data" button on `DownloadCard`, "Resume all" in `ResumeBanner` (on Home and at
  the top of the Downloads page). The answer is the `meteredConsent` passed on; on Wi-Fi it is false. Resume all
  resumes every `paused` download (the viewer's own pauses too) and every `failed` one, and with consent every
  `waiting` / `metered` one that is not refreshing; one predicate beside `isInterrupted` decides that set, for
  `resumeAll` and for the question's `{size}`, which sums `remainingBytes` over exactly it. A download
  `waiting` / `metered` shows "Use mobile data" on its card, which resumes with consent after the question, unless it
  is refreshing (badge rule 4): its card shows it as downloaded, with no resume of any kind.
- **Failed downloads.** By reason, before `engine.resume`: `source-changed` runs `checkSource` (which replaces the
  changed chapters with fresh validators); `source-gone` runs the takedown re-check for the parent (a takedown revokes
  and deletes it; otherwise `checkSource`); `integrity` and `http` resume as they are. When the check reports
  `deferredChapters`, `engine.resume` is **not** called: the same plan would fail again. The download stays `failed`
  until its session closes; the check that runs then replaces the changed chapters, which queues it again by itself.
  When the check cannot run, `engine.resume` is not called either and the viewer is told why ("could not be read" for
  `invalid-source`, `fetch-failed`, `key-required`, `decrypt-failed`).
- **Cancel.** `cancel(id)` on a card that is downloading drops the chapters still to come; with none done the download
  is removed.

**Badge rules** (`src/downloads/badges.ts`; the native tool's badge is the same function's result, sent as
`NowPlayingDownload`):

1. no entry, or `revoked`: `none`;
2. its `volumeId` is reported with `mounted: false`: `unavailable`;
3. needs attention (a reason other than `network`, `user` and `access` on a download that is not refreshing, or key
   `missing`): `attention`;
4. refreshing (`queued`, `waiting` or `downloading` with `item.state` and every unit `done`: only an item refresh is
   left): as rule 6;
5. `queued`, `downloading`, `waiting` or `paused`: `progress` with `percent = floor(100 × bytesDone / bytesTotal)`
   (0 when there is no progress yet);
6. `complete`: `downloaded`, `partial` when some chapter has no unit.

Cases the badge tests pin: each rule alone; `failed` with every reason (always `attention`); `waiting` / `network`
(`progress`) against `waiting` / `metered` (`attention`); a refreshing entry `waiting` / `metered` (`downloaded`, or
`partial`) against a `paused` one with every unit done (`progress`); a `complete` entry on an unmounted card (`unavailable`, ahead
of `downloaded`); a `revoked` entry on an unmounted card (`none`); `percent` at 0, 99.9 % (99) and 100.

## Lifecycle rules

| Event                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot                     | `list()`, then the re-check below for every entry. Pins are reconciled: every downloaded parent has its pin, no pin is left without a download (`getPinnedRetentionIds()` from `luminary-shared` lists the pins; the engine deletes downloads while no JavaScript runs, so a pin can outlive its download until the next boot)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Access map changes       | Each entry is checked against the new map, with the parent's groups as the stored content docs carry them: among the content's own stored copy, the stored translations of the parent and a stored parent doc, the one updated last; the snapshot's `memberOf` when none is stored. Changed groups are written back to the snapshot with `engine.update({ content })`. No `Download` or no `View`: `revoke(access)`. Revoked (or key `missing`) with access: queue a key fetch. An empty map means "not loaded" and is ignored. The same check runs for one entry when its parent's groups change: a delete command that carries `newMemberOf` (shared's removed-docs hook) for a downloaded parent or its content writes those groups to the snapshot (`keepGroups`) and checks that entry before any takedown re-check, and so does a `watchDocs` write of a downloaded parent whose `memberOf` differs from the snapshot's groups. A lost grant then ends in `revoke(access)`, files kept                                                                                                                                                                      |
| Key fetch queue          | About one fetch every 5 s; a fetch the player needs goes first; a rate-limit answer waits a minute; `unreachable` changes nothing. `key`: `restore` (revoked) or `putKey` (missing). `denied`: nothing (the access map decides)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Expiry                   | `expiresAt` is the latest expiry across the translations the viewer may view or has offline, none if any has no expiry, from one remote query per parent with `includeExpired`, made through the shared library's status-aware remote query so an empty answer is told from a failed request. Refreshed at boot, on connect and every 6 hours; written with `engine.update` only when it changes. The engine deletes at the moment it passes, online or not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Takedown                 | The same per-parent query: no published translation left that the viewer may view or has offline means `revoke(takedown)` only with corroboration: a delete command (`deleted` or `statusChange`) for the parent or its content within the last hour, the engine finding the source gone, or the same empty answer again on a later connection. One empty answer only records a strike, because a successful empty answer is also what an anonymous or not-yet-authenticated caller gets; an answer that lists a translation clears it, and an answer that is not a successful one is no answer. Online with the app open, a delete command or doc update for a downloaded parent or its content (shared's removed-docs hook) triggers the re-check within seconds; a group change is checked for access first (the access-map row), so a parent moved to groups the viewer cannot view is revoked for access, never taken down. Otherwise every download is re-checked on the next foreground or connect, and without a delete command a takedown completes on the second connection that gets the empty answer. A document merely missing locally never revokes |
| Orphans                  | The engine sweeps keyless downloads after 30 days; "Clean up" on `StorageCard` frees them now and shows the reclaimable size                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Retention pin            | A downloaded item's parent and content docs carry a retention stamp with no deadline (`shared/src/db/retention.ts`): set on `start`, removed on `removed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Delete local data        | When downloads exist, the settings action opens a dialog with `DeleteLocalDataOption` ("also delete downloads (size)", off by default); ticked, `lifecycle.removeAll()` runs first and deletes every download except one being played, resolving with the ids not deleted (the one being played, or any the engine could not delete). With any download left on the device (the option clear, a download kept because it is playing, or a removal that failed), the action calls `lifecycle.recheck()` after the purge, which restores the retention pins of the downloads it finds. When `kept` is not empty the viewer is told (`downloads.notice.kept_playing`, or a could-not-delete text for the others)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Logout                   | Not a trigger, and no downloads code runs. The signed-out access map arrives on reconnect and the access-map row decides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Source check             | Before every add (`start` for an existing download), and when a downloaded item is opened online, at most once a day (`lastSourceCheckAt`); the online-open check runs beside playback, not before it. Replaced chapters are queued again and the viewer is told ("Some chapters changed and will download again"). `deferredChapters` (the item is being played, so nothing was replaced) are checked again when its session ends: `playbackReleased`, `playbackClosed`, or `close()`. Until then the add or resume that asked for the check does not go ahead (_The sheet_, _Failed downloads_). `gone` is treated as a takedown re-check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Card out                 | A download on an unmounted volume keeps its entry, shows `unavailable`, is left out of `playableParentIds`, and streams online when played                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Revocation while playing | The engine stops the player itself and reports `playbackClosed`; the page shows the reason in the screen's notice (`downloads.notice.revoked`, or `downloads.notice.volume_unavailable` for a close for `volume-unavailable`) and does not reload the download. A player error whose `cause.code` is `offline-revoked` is the same revocation, whichever arrives first: the download stays the source, nothing falls back to streaming or reloads, and the notice shows when `playbackClosed` arrives. A `playbackClosed` for a session a fallback has just replaced still shows the notice; the stream is left alone, since the server checks it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Nothing reads `isAuthenticated`: playing needs only the files, the stored key and the entry. **Without the content
doc** (evicted despite the pin, or never synced on this device), the service builds a stand-in `ContentDto` from the
entry's `DownloadContentSnapshot` (`contentFromSnapshot` in `service.ts`: `_id` the snapshot's `contentId`, `parentId`,
`title`, `author`, `language`, `slug`, `memberOf`, `publishDate`, and `parentMedia` naming no online master), so the
Downloads page can open the item, `player.open` can play it and `openSheet` can manage it. Such a stand-in never
streams and is never eligible for a new download. The snapshot's `mediaId`, written at start from `mediaSourceFor`,
is the stand-in's progress id: the player resumes from saved progress, writes progress and the completed mark under
it, and sends it as the screen's `progressKey`; it is never a source, and `parentMedia` stays empty. A stand-in
autoplays and enters full screen as any item does.

## Eligibility

`eligibility(content)` is true when all hold:

1. The service exists (the build target supplied an engine).
2. The content has a `parentMedia` HLS master that is not a YouTube link. A live stream cannot be told from the doc;
   its playlist is refused when the sheet asks for the options.
3. The access map grants `View` and `Download` on the parent, with the parent's groups as the stored content docs
   carry them (the access-map row of _Lifecycle rules_; feed queries strip `memberOf`); false while the access map is
   empty. A download is not started without known groups.
4. The content has not expired (`expiryDate`).

The download tool, the Downloads page's "add chapters" and every other way in follow it. An item that already has a
download shows its badge whatever its eligibility; losing eligibility is the lifecycle's business.

## Where the UI hooks in

| Place        | Component                                                                                                                                                                                                                                                                           | What it gets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| My Downloads | `DownloadsPage.vue` at `/downloads` (`DownloadCard.vue`, `StorageCard.vue`, `ResumeBanner.vue` at the top), built on `BasePage`, `ActivitySection`, `groupByActivityDate` and `useShownOnceLoaded`, in the visual language of `ActivityFilterChips` and `ContentTile`'s card layout | sort by newest, oldest or largest; multi-select delete with the space it frees; Clean up; the location switch; per card: resume (with the mobile-data question), cancel, "add chapters" (the sheet with `context: "downloads"`), the stored artwork from `service.artwork(id)`                                                                                                                                                                                                                          |
| Menu links   | `ProfileMenu.vue`, `DesktopSidebar.vue`                                                                                                                                                                                                                                             | a link beside My Activity, `v-if` the service, with `attentionCount` as a red count while above 0 (a dot on the collapsed sidebar)                                                                                                                                                                                                                                                                                                                                                                      |
| Tiles        | `ContentTile.vue`, `ReadMore.vue`, `MediaPlayerUpNext.vue`, `SearchPanel.vue`                                                                                                                                                                                                       | `service.ui.DownloadBadge` with the parent id                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Home         | `HomePage.vue`                                                                                                                                                                                                                                                                      | `service.ui.ResumeBanner`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Watch        | `VideoPage.vue`, `PinnedVideo.vue`, `UnpinnedVideo.vue`                                                                                                                                                                                                                             | `service.ui.WatchFilterSwitch`, following the device (downloaded while offline) until the viewer picks, and back to downloaded whenever the device goes offline; with nothing playable, a line says so. The two lists take `parentIds` (from `playableParentIds`), add a `parentId` clause under their own cache ids (the unpinned list's category query too, since its values follow the filtered content), and are remounted when the mode changes, since a query's cache id is fixed when it is made |
| Settings     | `SettingsPage.vue`                                                                                                                                                                                                                                                                  | `service.ui.DeleteLocalDataOption` in the delete-local-data dialog; an `autoplayDownloadedOnly` switch beside the autoplay switch, with `service.ui.AutoplayModePill`, only when the service is injected                                                                                                                                                                                                                                                                                                |
| Autoplay     | `useNextUp.ts`, `src/media-player/autoplayMode.ts`                                                                                                                                                                                                                                  | `autoplayDownloadedOnly` (stored like the autoplay setting); offline the mode is forced to `downloaded` without changing the stored choice. Downloaded mode narrows what the end offers (and the next-item shortcut) to `playableParentIds`; the Up next panel lists everything. `service.ui.AutoplayModePill` beside the switch and in the end panel; on the page's own now-playing screen the pill sits in a button that switches the mode, disabled while offline forces it                          |
| The player   | `MediaPlayer.vue`, `MediaPlayerWrapper.vue`, `mediaPlayer.ts`                                                                                                                                                                                                                       | below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Strings** go in `api/src/db/seedingDocs/lang-eng.json` and `lang-fra.json` (the API backfills missing keys into
deployed language docs at startup): the page's own texts, the sheet's `DownloadSheetTexts`, the notifications'
`DownloadNotificationTexts`, and the now-playing screen's download texts.

**The native now-playing screen.** `MediaPlayer.vue` sends, with the screen it already sends: the download tool
(`download: { badge, percent, source, canPlayOnline }`) when the item is eligible or has a download; `notice` for
"More chapters are ready", the streaming fallback, a revocation and the casting message; `autoplayMode` and
`autoplayModeLocked` (sent as an explicit boolean whenever `autoplayMode` is sent); `downloaded` on up-next items;
`available` on chapters. It handles the player's `downloadaction`
event: `download` (`openSheet(content, { context: "player", selection })`, `selection` what plays), `chapterOnline`
(online at that chapter), `chapterDownload` (`openSheet` with `chapter` and the same `selection`), `autoplayMode`,
`notice` and `noticeDismiss`.

### Additions to the video-player contract and the native player component

The app, the native player component and the native build target build to these exact shapes. Each is optional, so
a target that has none keeps working.

| Where                     | Addition                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VideoPlayerService`      | `playsDownloads?: boolean`, reactive: true once the component can play a `luminary://offline/` master. The native target reports it when the shell has the downloads plugin and the player reports its `offline` capability; the web targets leave it out                                                                                                                            |
| `VideoBackgroundProgress` | `ended?: boolean`: it played to the end of what was loaded; for a download, `position` and `duration` are already full-item time                                                                                                                                                                                                                                                     |
| `VideoPlayerHandle`       | `castHeldLocal?: boolean`, reactive: a cast or AirPlay video device was chosen while a download plays, and the player kept playing the download; false again when the route returns to the phone, on iOS when the sound alone starts playing, or when the held local load ends, which the component clears itself since no event tells it                                            |
| `VideoNowPlayingScreen`   | `download?: VideoNowPlayingDownload \| null` (`{ badge: "none" \| "progress" \| "downloaded" \| "attention" \| "unavailable"; percent?: number; source?: "downloaded" \| "online"; canPlayOnline?: boolean }`); `notice?: { id: string; text: string; action?: string; dismissible: boolean } \| null`; `autoplayMode?: "all" \| "downloaded"`; `autoplayModeLocked?: boolean`       |
| `VideoNowPlayingTexts`    | `download`, `downloadProgress`, `downloaded`, `downloadAttention`, `downloadUnavailable`, `sourceDownloaded`, `sourceOnline`, `chapterNotDownloaded`, `chapterOnline`, `chapterDownload`, `autoplayMode`, `autoplayModeAll`, `autoplayModeDownloaded`, `closeNotice`                                                                                                                 |
| A new type and event      | `VideoDownloadAction = { action: "download" \| "chapterOnline" \| "chapterDownload" \| "autoplayMode" \| "notice" \| "noticeDismiss"; value?: string }`, raised as `downloadaction` with one `VideoDownloadAction` argument; `notice` and `noticeDismiss` carry the notice's id as `value`. `VideoNowPlayingAction` is unchanged                                                     |
| Component props           | `chapters` items may carry `available?: boolean`; `upNext` items may carry `downloaded?: boolean`. The native component types them as `Chapter & { available?: boolean }` and `PlayerUpNextItem & { downloaded?: boolean }` itself (the base types belong to the player libraries and stay as they are) and passes both fields through to the bridge in `browseLists()` and `card()` |
| `MediaPlayerWrapper.vue`  | binds `chapters` (converted, with `available`) for a download; for streaming it binds none, as today                                                                                                                                                                                                                                                                                 |

## The player integration

**Source choice** (`MediaPlayerWrapper.vue`, from the service's `sourceOverride`):

1. When the service exists and `VideoPlayerService.playsDownloads`, `service.player.open(content, { preferOnline })`,
   where `preferOnline` is true when `service.player.sourceOverride(parentId)` is `"online"`, and is ignored offline.
   The player follows a pick made while the item is open through `service.player.onSourceChosen`, and answers false
   when it could not (the sheet then shows its error).
2. It returns a `DownloadPlayback` (play the download), or null (stream) for nothing downloaded to play: no
   download, no playable chapter, the volume is not mounted, the key is missing, or Online is chosen while online.
3. A download is played with `PlayerSource { masterUrl: playback.masterUrl, keyHex: playback.keyHex, startPosition }`.
   No chapters sidecar is passed: the built master names the stored chapters, already in the download's time. The
   thumbnails sidecar is `playback.thumbnailsUrl`, and the now-playing artwork is `playback.artworkUrl`. No online key
   fetch is made for it.
4. When a playable download fails to open while online, the service raises the fallback notice itself through its
   notice path and resolves null, so the item streams; the player does not infer the notice. Offline, `open` rejects
   and the player's own offline error shows.

**Timeline conversion points** (`playback.timeline`, supplied by the engine). Progress is always stored in full-item
time with the full duration:

| Point                                                 | Conversion                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resumePoint()`                                       | `timeline.resumeLocal(savedFull)` replaces `saved − 30`; a saved position in a missing chapter starts at the next downloaded one, and the saved position is not replaced until playback moves |
| The progress writer (`onTimeUpdate`, `flushProgress`) | `setMediaProgress(id, contentId, timeline.toFull(t), timeline.fullDuration)`                                                                                                                  |
| The watch tracker                                     | `watchTracker.track(timeline.toFull(t))`, and `claimCompletionIfWatched(timeline.fullDuration, …)`                                                                                            |
| `finishPlaythrough()`                                 | finished only when `toFull` of the end reaches 95 % of the full duration                                                                                                                      |
| `onEnded()`                                           | at the end of a partial download below 95 %, the `completed` mark (`contentProgress.ts`) instead of finished                                                                                  |
| Chapters for the screens                              | `timeline.chapter(chapter)` gives the download-time times and `available`                                                                                                                     |
| Background progress                                   | the engine already reports full-item time; `ended` below 95 % sets the `completed` mark                                                                                                       |

The rules the engine's timeline follows, so the fake engine implements the same and the app's tests pin the same
values:

With no spans, `toFull` and `resumeLocal` give 0 and `localDuration` is 0.

1. `toLocal(t)`: no spans gives undefined; `k` is the first span with `t < fullEnd_k`; none (at or past the last
   span's end) gives `{ local: 0, exact: false }`; `t >= fullStart_k` gives `{ local: localStart_k + t − fullStart_k,
exact: true }`; otherwise (a gap) `{ local: localStart_k, exact: false }`.
2. `toFull(l)`: clamp `l` to `[0, localDuration]`; `k` is the last span with `localStart_k <= l` (a boundary belongs
   to the later span); `fullStart_k + l − localStart_k`.
3. `resumeLocal(p)`: when `toLocal(p)` is not exact, its `local`; otherwise `localStart_k + max(0, p − 30 −
fullStart_k)`.
4. `chapter(c)`: available when it has at least one unit, all of them done at open, and its start lies inside a span,
   with `startTime = toLocal(start).local` and `endTime = toLocal(min(end, fullEnd_k)).local` (the span's local end when
   `end` reaches `fullEnd_k`); otherwise `startTime = endTime =` the `localStart` of the first span starting at or after
   `start` (or `localDuration`).

| Spans `[0, 8) @0`, `[20, 72) @8`; full 80               | Result                                                    |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `toLocal` 7.5, 8, 12, 20, 72                            | 7.5 exact; 8 not exact; 8 not exact; 8 exact; 0 not exact |
| `toFull` 7.999, 8, 19.5, 65, −1                         | 7.999; 20; 31.5; 72; 0                                    |
| `resumeLocal` 5, 65, 12, 75, 40                         | 0; 23; 8; 0; 8                                            |
| `chapter` 0–6, 6–14 (not done), 22–72, 72–80 (not done) | 0–6; 8–8 unavailable; 10–60; 60–60 unavailable            |

**The mid-play switch.** `service.player.onMoreReady(parentId)` fires when more of the item playing becomes playable;
everything that finishes within 2 s is folded into one. Not playing: switch at once. Playing: show the notice;
accepting switches, declining switches at the next pause. The switch: `full = old.timeline.toFull(current)`, open the
download again, `local = new.timeline.toLocal(full).local`, then load the new source with `startPosition: local` and
**no** `preservePosition` (under it the controller would take the engine's position on the old timeline), carrying
the held angle as `startAngleId`, and call `play()` once the load settles when it was playing. The sound stops briefly
while the new source loads. The same applies, with `full` the online position, when an item streamed while
downloading has its current chapter on the device, unless Online is chosen or the position is in a chapter not yet
downloaded. A stream playing to a cast or AirPlay video device stays on the stream: more being ready is neither
switched to nor offered, with the picture or the sound alone (the device fetches the media itself and cannot reach the
phone's files, and a load from disk ends a cast). A cast or AirPlay video device chosen while a download plays loads
the online source at the same position when online, with the picture or the sound alone, and tells the viewer casting
is not available offline otherwise. A Bluetooth or wired audio route is not such a device: it raises neither
`airPlayActive` nor `castHeldLocal`, and a download keeps playing through it, online or offline. An AirPlay route
chosen while a download plays on iOS follows the iOS rule (_Casting a download_, below).

**The completed mark.** `contentProgress.ts`'s watching entry gains `completed`: set at the end of a partial download
(in the page or from background progress) while below the finished line; `ContinueProgress.vue` hides finished and
completed entries; every other view keeps the real percentage; the next progress write that is not an end clears it.
Choosing the next item while a download plays leaves the completed mark at the position playing, unless that position
is past the finished line (online, the same choice books the item finished).

**Casting a download.** When `castHeldLocal` turns true: online, with the picture or the sound alone, switch to the
online source at the same position (the mid-play switch, with `full = timeline.toFull(current)`), which the existing
cast path then sends; offline, show "Casting is not available offline" in the screen's notice and change nothing. On
iOS a load from disk plays with external playback off, so an AirPlay route chosen during it carries the phone's sound
only, and no public signal tells an AirPlay speaker from an AirPlay video device. While the picture plays, every AirPlay
route counts as a device and raises `castHeldLocal`; while the sound alone plays (an audio-only download, or the viewer
turned the picture off), none does, since the route already plays the download as it is. iOS tells the page only once
it knows which: a load from disk whose tracks are not yet known raises nothing, and a change between the picture and the
sound alone tells the page again. Bluetooth and wired routes never count.

## The fake engine

`src/downloads/fakeEngine.ts` implements `DownloadsEngine` in memory so the UI can be built and tested in a browser:

- entries and progress in memory, advanced by a timer (or by `tick()` in tests); `start` creates a `queued` entry and
  moves it through `downloading` to `complete`;
- `options` returns fixed choices and sizes from a small fixture;
- `openPlayback` returns the online master with a timeline made from the done units by the rules above, so the web
  player plays it and the conversions are exercised;
- `presentSheet` and `updateSheet` record the model; tests act through `fake.act(action)`, and in DEV a small debug
  panel shows the model with buttons for the actions;
- `fail(downloadId, reason)`, `setNetwork`, `setFreeBytes`, `setMounted(volumeId, mounted)`, `deferNextCheck()` and
  `closeSession` drive the edge cases.

It is installed only when `import.meta.env.DEV` and the `fakeDownloads` query flag are both set, through a dynamic
import the production build removes, so neither web bundle contains it. It arrives after the plugins install: on the
development server a component set up before it lands sees no service, and a first navigation to `/downloads` is
repeated once the route exists.

## Mapping `DownloadsEngine` onto the native plugin

The native build target's adapter maps each engine call onto `DownloadsClient`, the TypeScript surface the native
player package exports beside its plugin (`createDownloadsClient(plugin, { sparsePlayback })`; types in its
`src/downloads/bridge.ts`). That package owns every fetch, decryption, comparison, plan and playlist; the adapter only
registers the plugin, passes its over-the-air `sparsePlayback` switch, and maps one to one. Field names match, and the
sheet model passes through unchanged. The adapter provides no engine when the plugin is unavailable or
`createDownloadsClient` resolves null (another protocol version). The native target reads the `sparsePlayback` switch
from the web build's `VITE_DOWNLOADS_SPARSE_PLAYBACK_OFF`, a comma list of platforms on which partial downloads are
off (empty: on everywhere), so a bundle delivered over the air can turn them off.

| `DownloadsEngine`                             | `DownloadsClient` / plugin                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `capabilities`                                | `client.info.capabilities`: `notifications`, `volumes`, `sheet`, `sparsePlayback` (already combined with the host's switch)                 |
| `list()`                                      | `plugin.list()`: each record becomes an entry (`volume.id` → `volumeId`; `schema`, `texts` and `volume.path` dropped)                       |
| `network()`, `storage()`                      | `plugin.getNetwork()`, `plugin.getStorage()`                                                                                                |
| `setPreferredVolume(id)`                      | `plugin.setPreferredVolume({ volumeId })`                                                                                                   |
| `requestNotificationPermission()`             | `plugin.requestNotificationPermission().granted`                                                                                            |
| `options(source, selection)`                  | `client.estimate(source, selection)`                                                                                                        |
| `start(request)`                              | `client.start(request)`, the record mapped as in `list`                                                                                     |
| `checkSource(id, source)`                     | `client.checkSource(id, source)`                                                                                                            |
| `update(id, patch)`                           | `plugin.updateRecord({ downloadId, ...patch })`                                                                                             |
| `pause`, `resume`, `cancel`                   | `plugin.pause`, `plugin.resume` (with `meteredConsent`), `plugin.cancel`                                                                    |
| `remove(ids)`                                 | `plugin.remove({ downloadIds }).results`                                                                                                    |
| `cleanUp()`                                   | `plugin.cleanUp().freedBytes`                                                                                                               |
| `openPlayback(id)`                            | `client.openSession(id)`: `masterUrl`, `keyHex`, `thumbnailsUrl`, `artworkUrl`, `timeline`                                                  |
| `closePlayback(id)`                           | `client.closeSession(id)`                                                                                                                   |
| `artwork(id)`                                 | `client.readArtwork(id)`                                                                                                                    |
| `putKey`, `revoke`, `restore`                 | the same plugin calls                                                                                                                       |
| `presentSheet`, `updateSheet`, `dismissSheet` | the same plugin calls; the model and texts pass through                                                                                     |
| `on("entry")`                                 | `downloadchange` (`record` mapped as in `list`)                                                                                             |
| `on("progress")`, `on("removed")`             | `progress`, `removed`                                                                                                                       |
| `on("playbackClosed")`                        | `playbackclosed`                                                                                                                            |
| `on("playbackReleased")`                      | `playbackreleased`                                                                                                                          |
| `on("network")`                               | `networkchange`                                                                                                                             |
| `on("storage")`                               | `storagechange`                                                                                                                             |
| `on("sheetAction")`                           | `sheetaction`                                                                                                                               |
| `on("notificationTap")`                       | `notificationtap`                                                                                                                           |
| rejections                                    | the plugin's code, or the client's own (`invalid-source`, `fetch-failed`, `key-required`, `decrypt-failed`), becomes `Error.code` unchanged |

## Decisions

- **The service owns the sheet's model; the engine only presents it.** The model needs the access map, the entries,
  the network and the player's state, which only the app has.
- **Download ids are minted by the app** with `crypto.randomUUID()`, so a deleted and re-added item never reuses one.
- **Expiry is refreshed every 6 hours** besides boot and connect: frequent enough for a moved expiry date to land the
  same day, cheap at one query per downloaded parent.
- **The groups for the access check fall back to the snapshot's `memberOf`** when no content doc of the parent is on
  the device, so an evicted doc never revokes or grants on its own; the retention pin makes that rare.
- **The engine supplies the timeline** with each session, so the app has no conversion code of its own and cannot
  disagree with what native writes as background progress. The rules are copied above only for the fake engine and
  the tests.
- **The badge is the app's alone,** including the native tool's: native only draws what the page sends.
- **The location of new downloads is kept by the engine,** not in web storage, which holds no downloads state.
- **Replacements found while the item plays are deferred,** and the source check runs again when the session closes,
  rather than holding playback until the check is done.
- **Every web-drawn resume asks the mobile-data question** on a metered network, as the native sheet does; consent is
  set anew by every resume.
- **The playback session carries the thumbnails and artwork addresses,** rather than the target deriving them from
  the master's folder, because a download's side files are not beside its built master.
- **The fake engine plays the online master** so the browser's player works unchanged, while the timeline it returns
  still exercises every conversion.
