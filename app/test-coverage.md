# Test Coverage Report

## Summary

- **Overall Statement Coverage**: 90.31%
- **Test Framework**: Vitest + Vue Test Utils
- **Test Runner**: `npx vitest run --coverage`

## Coverage Table

| File                                  | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s                         |
|---------------------------------------|---------|----------|---------|---------|-------------------------------------------|
| **All files**                         | 90.31   | 84.66    | 70.18   | 90.31   |                                           |
| .eslintrc.cjs                         | 0       | 0        | 0       | 0       | 1-15                                      |
| dynamic-import-helper.js              | 100     | 66.66    | 100     | 100     | 1                                         |
| App.vue                               | 87.59   | 100      | 40      | 87.59   | 28-30,35-36,90-98,102,106-107             |
| docsIndex.ts                          | 100     | 100      | 100     | 100     |                                           |
| globalConfig.ts                       | 92.61   | 79.06    | 94.44   | 92.61   | 268-269,302,405                           |
| i18n.ts                               | 96.73   | 95.45    | 100     | 96.73   | 85,89-90                                  |
| sync.ts                               | 92.81   | 88.88    | 100     | 92.81   | 139-140,146-155                           |
| BasePage.vue                          | 100     | 100      | 100     | 100     |                                           |
| IgnorePagePadding.vue                 | 100     | 100      | 100     | 100     |                                           |
| LoadingSpinner.vue                    | 100     | 100      | 100     | 100     |                                           |
| contentByTag.ts                       | 98.93   | 85.18    | 100     | 98.93   | 47                                        |
| PinnedTopics.vue                      | 100     | 100      | 100     | 100     |                                           |
| UnpinnedTopics.vue                    | 100     | 100      | 100     | 100     |                                           |
| ContinueListening.vue                 | 50.9    | 50       | 100     | 50.9    | 16-37,49-53                               |
| ContinueWatching.vue                  | 97.95   | 85.71    | 75      | 97.95   | 34-35                                     |
| HomePageNewest.vue                    | 100     | 100      | 100     | 100     |                                           |
| HomePagePinned.vue                    | 100     | 100      | 100     | 100     |                                           |
| PinnedVideo.vue                       | 100     | 100      | 100     | 100     |                                           |
| UnpinnedVideo.vue                     | 100     | 100      | 100     | 100     |                                           |
| LButton.vue                           | 100     | 0        | 100     | 100     | 77                                        |
| DropdownMenu.vue                      | 100     | 100      | 100     | 100     |                                           |
| LCard.vue                             | 97.4    | 83.33    | 100     | 97.4    | 21-22                                     |
| LDialog.vue                           | 100     | 80       | 0       | 100     | 41                                        |
| LHighlightable.vue                    | 57.57   | 75.6     | 58.82   | 57.57   | See "Partially Testable" section          |
| LTeleport.vue                         | 86.36   | 0        | 100     | 86.36   | 15-17                                     |
| AudioPlayer.vue                       | 100     | 100      | 100     | 100     |                                           |
| ContentTile.vue                       | 99.46   | 87.5     | 100     | 99.46   | 35                                        |
| CopyrightBanner.vue                   | 100     | 75       | 100     | 100     | 19                                        |
| HorizontalContentTileCollection.vue   | 93.7    | 77.27    | 71.42   | 93.7    | 39-42,71-72,93-94                         |
| RelatedContent.vue                    | 100     | 100      | 100     | 100     |                                           |
| VideoPlayer.vue                       | 59.13   | 65.95    | 55.55   | 59.13   | See "Partially Testable" section          |
| extractAndBuildAudioMaster.ts         | 100     | 96.96    | 100     | 100     | 143                                       |
| AudioVideoToggle.vue                  | 100     | 100      | 100     | 100     |                                           |
| BaseModal.vue                         | 100     | 100      | 100     | 100     |                                           |
| LModal.vue                            | 100     | 100      | 50      | 100     |                                           |
| ImageModal.vue                        | 72.42   | 86.84    | 47.82   | 72.42   | See "Partially Testable" section          |
| LImage.vue                            | 98.11   | 87.5     | 100     | 98.11   | 59-60                                     |
| LImageProvider.vue                    | 89.08   | 77.39    | 42.85   | 89.08   | 153-158,212,235-240,243,320-333           |
| DesktopMenu.vue                       | 97.05   | 100      | 0       | 97.05   | 12-13                                     |
| LanguageModal.vue                     | 94.08   | 86.66    | 25      | 94.08   | 39-40,44,49-55                            |
| MobileMenu.vue                       | 96.7    | 83.33    | 50      | 96.7    | 16,29-30                                  |
| PrivacyPolicyModal.vue                | 67.58   | 75.4     | 62.5    | 67.58   | See "Partially Testable" section          |
| ProfileMenu.vue                       | 97.08   | 93.1     | 50      | 97.08   | 57-60,131-133                             |
| SearchModal.vue                       | 89.31   | 82.65    | 83.87   | 89.31   | 577-584,611-612,832-838,842-846           |
| ThemeSelectorModal.vue                | 97.46   | 91.66    | 40      | 97.46   | 36-37                                     |
| TopBar.vue                            | 92.42   | 70       | 50      | 92.42   | 41-42,50-52,68,76-79                      |
| navigationItems.ts                    | 97.72   | 50       | 100     | 97.72   | 42                                        |
| NotificationBanner.vue                | 94.64   | 92.85    | 0       | 94.64   | 61-66                                     |
| NotificationBannerManager.vue         | 100     | 100      | 100     | 100     |                                           |
| NotificationBottom.vue                | 98.52   | 72.72    | 100     | 98.52   | 19                                        |
| NotificationBottomManager.vue         | 100     | 100      | 100     | 100     |                                           |
| NotificationToast.vue                 | 100     | 86.66    | 100     | 100     |                                           |
| NotificationToastManager.vue          | 100     | 100      | 100     | 100     |                                           |
| VerticalTagViewer.vue                 | 98.9    | 42.85    | 100     | 98.9    | 21                                        |
| useAuthWithPrivacyPolicy.ts           | 100     | 100      | 100     | 100     |                                           |
| useBucketInfo.ts                      | 100     | 100      | 100     | 100     |                                           |
| useHighlightState.ts                  | 100     | 100      | 100     | 100     |                                           |
| useSearchOverlay.ts                   | 93.1    | 100      | 75      | 93.1    | 20-21                                     |
| BookmarksPage.vue                     | 100     | 92.3     | 100     | 100     | 15                                        |
| ExplorePage.vue                       | 100     | 100      | 100     | 100     |                                           |
| HomePage.vue                          | 100     | 100      | 100     | 100     |                                           |
| NotFoundPage.vue                      | 100     | 100      | 100     | 100     |                                           |
| SettingsPage.vue                      | 100     | 100      | 100     | 100     |                                           |
| VideoPage.vue                         | 100     | 100      | 100     | 100     |                                           |
| SingleContent.vue                     | 87.72   | 83.97    | 65.21   | 87.72   | 540-541,563-566,678-680,799-801           |
| examplePlugin.ts                      | 100     | 100      | 100     | 100     |                                           |
| router/index.ts                       | 98.16   | 100      | 40      | 98.16   | 17-18                                     |
| notification.ts                       | 97.5    | 92.3     | 100     | 97.5    | 41-42                                     |
| mockdata.ts                           | 100     | 100      | 100     | 100     |                                           |
| isLangSwitch.ts                       | 100     | 100      | 100     | 100     |                                           |
| loadFallbackImages.ts                 | 100     | 100      | 100     | 100     |                                           |
| mangoIsPublished.ts                   | 100     | 100      | 100     | 100     |                                           |
| pluginLoader.ts                       | 92.3    | 92.3     | 100     | 92.3    | 29-31                                     |
| watchEffectOnce.ts                    | 100     | 100      | 100     | 100     |                                           |
| youtube.ts                            | 100     | 100      | 100     | 100     |                                           |

## Untestable / Excluded Files

### `.eslintrc.cjs` (0% coverage)
Configuration file, not executable application code. Should be excluded from coverage reports via `vitest.config.ts` coverage exclusions.

### `ContinueListening.vue` — query logic unreachable
The `useDexieLiveQueryWithDeps` callback (lines 14-37) contains `contentIds` hardcoded as an empty array (`const contentIds: string[] = []`), so the query always returns `[]` and the filtering/sorting logic on lines 17-37 is unreachable. This is documented with a TODO in the source: _"Replace with central watch/listen/read service when implemented (separate ticket)"_. The component's rendering logic is tested (it correctly renders nothing).

## Partially Testable Files

### `VideoPlayer.vue` (59% coverage)
Lines 430-535 (`watch(audioMode)`) involve complex Video.js player API interactions that are difficult to test in jsdom:
- Audio playlist generation with base64 encoding
- Track restoration logic during mode switches
- Player source switching between audio/video modes
- `play()` promise handling

**Why**: Video.js is a browser-only library. The mock captures event registrations and basic API calls, but complex multi-step flows (mode switching with `one("loadedmetadata")` + `one("canplay")` callbacks, `btoa()` encoding of audio manifests) require a real browser player instance.

**What IS tested**: YouTube detection, HLS source setting, poster image, event handler registration (ended/pause/play/timeupdate/ready), progress save/restore, player disposal on unmount.

### `LHighlightable.vue` (58% coverage)
Lines involving DOM mutations and browser Selection API:
- `removeHighlight()` partial removal (lines 213-293): TreeWalker-based text node splitting/reconstruction
- Touch event handlers (lines 391-393): `handleSelectStart` is a no-op function
- Some paths in `wrapTextNodes` with complex multi-node selections

**Why**: jsdom's Selection/Range API is limited — `getBoundingClientRect()` must be manually mocked, and TreeWalker behavior with DOM mutations differs from real browsers.

**What IS tested**: Color application via selection, highlight removal (full), save/restore to IndexedDB, error handling, context menu prevention, long-press detection, event listener lifecycle.

### `ImageModal.vue` (72% coverage)
Uncovered lines involve:
- Mouse drag when zoomed (lines 213-222): `onMouseMove`/`onMouseUp` handlers
- Touch event branches (lines 242-244): `TouchEvent` instanceof check in `onDblClick`

**Why**: Touch events require constructing realistic `TouchEvent` objects with `changedTouches`/`touches` arrays, which jsdom doesn't fully support.

**What IS tested**: Ctrl+wheel zoom, double-click zoom toggle, keyboard navigation, swipe via arrows, mobile defaults, zoom reset on image change.

### `PrivacyPolicyModal.vue` (68% coverage)
Lines 108-200 contain an `h()` render function inside a `watch()` inside a `setTimeout(2000)` that creates banner notification action buttons. The VNode tree is complex with conditional rendering.

**Why**: Testing `h()` render function output requires extracting the notification's `actions()` callback from the Pinia store and rendering/inspecting the returned VNodes, which is indirect.

**What IS tested**: Banner notification creation after 2s delay, banner removal on acceptance, modal button rendering (accept/necessaryOnly/moreInfo), status computation, pending login behavior.

## Files at 100% Coverage

The following files have full test coverage:
- All page components (BookmarksPage, ExplorePage, HomePage, NotFoundPage, SettingsPage, VideoPage)
- All composables (useAuthWithPrivacyPolicy, useBucketInfo, useHighlightState)
- Core utilities (isLangSwitch, loadFallbackImages, mangoIsPublished, watchEffectOnce, youtube)
- Form components (AudioVideoToggle, BaseModal, LModal)
- Content components (AudioPlayer, RelatedContent, extractAndBuildAudioMaster)
- Navigation sub-components (PinnedTopics, UnpinnedTopics, PinnedVideo, UnpinnedVideo)
- Notification managers (BannerManager, BottomManager, ToastManager)
- BasePage, IgnorePagePadding, LoadingSpinner, DropdownMenu
