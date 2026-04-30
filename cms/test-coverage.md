# CMS Test Coverage

## Current Coverage Summary

| Metric     | Coverage | Baseline (before) |
| ---------- | -------- | ----------------- |
| Statements | ~88%     | 80%               |
| Branches   | ~87%     | 83%               |
| Functions  | ~57%     | 49%               |
| Lines      | ~88%     | 80%               |
| Test Files | 102      | 81                |
| Tests      | 674      | 548               |

## Running Coverage

```bash
# Full coverage report (generates HTML report in coverage/)
npx vitest run --coverage

# Coverage for specific files
npx vitest run --coverage src/util/youtubeUtils.spec.ts

# Watch mode (no coverage)
npx vitest
```

The HTML report is generated at `coverage/index.html`.

## Files at 100% Coverage

### Utilities
- `src/util/onlyAllowedKeys.ts`
- `src/util/renderErrorMessage.ts`
- `src/util/slug.ts`
- `src/util/sortByName.ts`
- `src/util/string.ts`
- `src/util/useId.ts`
- `src/util/youtubeUtils.ts`
- `src/util/watchEffectOnce.ts`
- `src/util/getPreferredContentLanguage.ts`
- `src/docsIndex.ts`

### Components
- `src/components/BleedHorizontal.vue`
- `src/components/LoadingBar.vue`
- `src/components/OnlineIndicator.vue`
- `src/components/notifications/LNotification.vue`
- `src/components/notifications/NotificationManager.vue`
- `src/components/modals/LModal.vue`
- `src/components/modals/LanguageModal.vue`
- `src/components/forms/FormLabel.vue`
- `src/components/forms/FormMessage.vue`
- `src/components/forms/LRadio.vue`
- `src/components/forms/LSelect.vue`
- `src/components/forms/LTextToggle.vue`
- `src/components/forms/LTextarea.vue`
- `src/components/forms/LToggle.vue`
- `src/components/common/LTabs.vue`
- `src/components/content/ContentValidator.ts`
- `src/components/content/EditContentVideo.vue`
- `src/components/content/LTag.vue`
- `src/components/content/LanguageSelector.vue`
- `src/components/navigation/TopBar.vue`
- `src/components/languages/LanguageDisplayCard.vue`
- `src/components/languages/LanguageOverview.vue`
- `src/components/editor/icons/BoldIcon.vue`
- `src/components/editor/icons/BulletListIcon.vue`
- `src/components/editor/icons/ItalicIcon.vue`
- `src/components/editor/icons/NumberedListIcon.vue`
- `src/components/editor/icons/StrikethroughIcon.vue`
- `src/components/content/ContentOverview/FilterOptionsMobile.vue`

### S3 / Storage
- `src/components/s3/BucketDisplayCard.vue` (near 100%)

### Navigation
- `src/components/navigation/SideBar.vue` (near 100%)

### Composables & Stores
- `src/composables/attrsWithoutStyles.ts`
- `src/composables/storageValidation.ts` (near 100%)
- `src/tests/mockdata.ts`

### Pages
- `src/pages/DashboardPage.vue`
- `src/pages/NotFoundPage.vue`
- `src/pages/SettingsPage.vue`
- `src/pages/StoragePage.vue`

## Excluded from Coverage

These files are excluded in `vitest.config.ts` and do not count toward coverage metrics:

| File | Reason |
| ---- | ------ |
| `playwright.config.ts` | E2E test configuration, not application logic |
| `postcss.config.js` | Build tool configuration |
| `tailwind.config.ts` | CSS framework configuration |
| `.eslintrc.cjs` | Linter configuration |
| `src/pages/internal/ComponentSandbox.vue` | Internal developer tool for previewing UI components |
| `src/main.ts` | App entry point with side effects (Auth0 init, Sentry, Pinia, Router, Socket.IO). Covered by E2E tests. |

## Files That Cannot Easily Reach 100%

### `src/auth.ts` (~50% coverage, up from 24%)
Deep Auth0 SDK integration. `setupAuth()` initializes Auth0 with browser APIs (localStorage, window.location, redirect callbacks) - requires a real Auth0 environment. `loginRedirect()` and `getToken()` are now well-tested. The E2E test suite with `VITE_AUTH_BYPASS=true` covers the critical auth flow end-to-end.

### `src/components/images/ImageEditor.vue` (~40% coverage, up from 29%)
Heavy use of browser File APIs (FileReader, DataTransfer, drag-and-drop events) and S3 bucket queries via `storageSelection()` composable. The `handleFiles()`/`processFiles()` flow requires complex DOM event simulation with mock FileReader. Basic rendering, empty states, and drag events are covered.

### `src/components/media/MediaEditor.vue` (~40% coverage, up from 31%)
Same challenges as ImageEditor - audio file upload, language selection, FileReader API. Basic rendering, empty states, upload constraints, and thumbnail rendering are covered. The language selection and replacement confirmation modals are difficult to test in isolation.

### `src/components/groups/GroupOverview.vue` (~25%)
Uses `ApiLiveQueryAsEditable` class with complex filter/modify functions and ACL entry manipulation. Tested via mock express API server. The `filterFn`/`modifyFn` logic is deeply coupled to the query lifecycle.

### `src/components/users/UserOverview.vue` (~28%)
Complex filtering, pagination with sessionStorage persistence, and `ApiLiveQuery` pattern. Tested via mock express API server. The search/filter/pagination interaction is deeply coupled.

### `src/components/content/EditContentBasic.vue` (~41%)
Complex form with slug auto-generation, publish/expiry dates (Luxon), redirect conflict detection. The uncovered lines are largely in the template's `<script setup>` initialization block.

### `src/components/images/ImageEditorThumbnail.vue` (~98% coverage)
Mostly covered. Remaining uncovered lines are blob URL creation in the srcset computed for upload data (line 27-28) and the imageKey computation edge case (line 76).

### `src/components/media/MediaEditorThumbnail.vue` (~94% coverage)
Mostly covered. Remaining uncovered: some template rendering paths for the upload data variant (lines 187, 215, 237) and blob URL cleanup timing.

### `src/components/images/ImageEditor.vue` (~29% statements)
The v8 SFC setup block (lines 1-290) shows as uncovered. Branch coverage is 88% and function coverage is 38%. The storageSelection composable integration, file validation, drag-and-drop, and bucket auto-selection are all tested. Remaining: processFiles internal FileReader async flow and removeFileCollection/removeFileUploadData logic.

### `src/components/media/MediaEditor.vue` (~31% statements)
Same v8 SFC issue. Branch coverage is 82% and function coverage is 15%. The bucket validation, language selector, and auto-selection are tested. Remaining: processFileUpload async FileReader, replace confirmation flow, and language-based upload deduplication.

### `src/components/groups/GroupOverview.vue` (~98% coverage)
Nearly fully covered. Remaining lines 109-111 are the filterFn/modifyFn callbacks passed to ApiLiveQueryAsEditable which are closures consumed by the library internally.

### `src/components/s3/StorageOverview.vue` (~81% coverage)
Well covered. Remaining uncovered: credential validation branches in saveBucket (password validation, partial credential checking), and error notification paths for save/delete failures.

### Low function coverage (~54% overall)
Many Vue components report 0% function coverage for `<script setup>` blocks because v8 counts the setup function itself as uncovered even when the component template logic is fully tested. This is a known limitation of v8 coverage with Vue SFC compilation — **not** a gap in test quality.

## What Was Added

### New Test Files (18 files)
| File | Covers |
| ---- | ------ |
| `src/util/youtubeUtils.spec.ts` | `isYouTubeUrl()`, `extractYouTubeId()` - all URL formats |
| `src/util/watchEffectOnce.spec.ts` | `watchEffectOnce()`, `watchEffectOnceAsync()` |
| `src/util/getPreferredContentLanguage.spec.ts` | All fallback paths |
| `src/util/waitUntilAuth0IsLoaded.spec.ts` | Auth bypass, loading states, callback |
| `src/components/BleedHorizontal.spec.ts` | Slot rendering |
| `src/components/editor/icons/EditorIcons.spec.ts` | SVG rendering for Bold, Italic, Strikethrough |
| `src/components/forms/LTextarea.spec.ts` | v-model, slots, states, sizes, disabled, icons, add-ons |
| `src/components/common/LTabs.spec.ts` | Tab click, active state, icons, mobile select |
| `src/components/common/DisplayCard.spec.ts` | Navigation, slots, offline changes badge |
| `src/components/common/LDropdown.spec.ts` | Toggle, keyboard nav, padding, aria-expanded |
| `src/components/redirects/RedirectDisplaycard.spec.ts` | Slugs, type badge, groups, HOMEPAGE fallback |
| `src/components/redirects/RedirectOverview.spec.ts` | List rendering, permission-gated create button |
| `src/components/redirects/RedirectTable.spec.ts` | Table headers, rows, empty state |
| `src/components/navigation/SideBar.spec.ts` | Navigation items, permissions, toggle sections, close emit |
| `src/components/s3/BucketDisplayCard.spec.ts` | Status display, groups, date, edit permission, all status types |
| `src/components/images/ImageEditorThumbnail.spec.ts` | Srcset, blob URL, error fallback, delete dialog, emit events |
| `src/components/media/MediaEditorThumbnail.spec.ts` | Language badge, delete dialog, audio src, blob URL |
| `src/components/users/UserFilterOptions.spec.ts` | Desktop/mobile variant, debounced search, reset filters |

### Extended Test Files (21 files)
| File | What was added |
| ---- | -------------- |
| `src/util/sortByName.spec.ts` | Equal names case, reverse order case |
| `src/util/string.spec.ts` | `getTheFirstLetter()` tests |
| `src/components/common/LPaginator.spec.ts` | First/last page, extended variant, page size, bounds |
| `src/components/common/LTable.spec.ts` | Custom sortMethod, descending sort, sort cycling, unsortable |
| `src/components/button/LButton.spec.ts` | Segmented button, main/right-click, actions, disabled, tooltip |
| `src/auth.spec.ts` | `loginRedirect()` retry logic, connection reuse, token error handling |
| `src/components/modals/ConfirmBeforeLeavingModal.spec.ts` | Stay/discard actions, dialog text verification |
| `src/components/images/ImageEditor.spec.ts` | Empty states, file input, drag events, expose, upload thumbnails |
| `src/components/media/MediaEditor.spec.ts` | Empty collections, expose, upload thumbnails |
| `src/components/groups/EditAclEntry.spec.ts` | Doc type display, multiple permissions, empty permissions, doc type filtering |
| `src/components/navigation/ProfileMenu.spec.ts` | Avatar display, fallback icon, settings nav, language/settings menu items |
| `src/components/common/LPaginator.spec.ts` | Extended variant page click, bounds checking, disabled buttons, pageCount |
| `src/components/editor/RichTextEditor.spec.ts` | Toolbar link/unlink buttons, exposed editor instance |
| `src/components/media/MediaEditorThumbnail.spec.ts` | Play/pause toggle, ended event, global audio coordination |
| `src/components/redirects/RedirectOverview.spec.ts` | Multiple redirects, create modal open |
| `src/components/common/LPaginator.spec.ts` | Disabled navigation when undefined docs, page window near end |
| `src/components/content/EditContentBasic.spec.ts` | Slug auto-generation, slug editing, redirect warning, publish date setter |
| `src/components/s3/StorageOverview.spec.ts` | Validation errors, access denied delete |
| `src/components/groups/GroupOverview.spec.ts` | Permission-gated create button, ConfirmBeforeLeavingModal |
| `src/components/images/ImageEditor.spec.ts` | storageSelection mock, bucket validation, upload data, file size validation, auto-select |
| `src/components/media/MediaEditor.spec.ts` | storageSelection mock, bucket validation, language selector, auto-select |
| `src/components/users/UserOverview.spec.ts` | Permission-gated create, paginator rendering |

## Testing Patterns

### Mocking Auth0
```typescript
vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
            user: ref({ name: "Test User", email: "test@example.com" }),
            logout: vi.fn(),
            getAccessTokenSilently: vi.fn().mockResolvedValue("mockToken"),
        }),
    };
});
```

### Mocking globalConfig
```typescript
vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
        isMobileScreen: ref(false),
    };
});
```

### Mocking vue-router (with currentRoute)
```typescript
vi.mock("vue-router", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "edit" }),
        }),
    };
});
```

### Seeding the Database
```typescript
import { db } from "luminary-shared";
import * as mockData from "@/tests/mockdata";

await db.docs.bulkPut([mockData.mockPostDto, mockData.mockEnglishContentDto]);
```

### Testing Component Events
```typescript
await wrapper.find("input").setValue("test");
expect(wrapper.emitted("update:modelValue")![0]).toEqual(["test"]);
```

### Async Assertions with waitForExpect
```typescript
import waitForExpect from "wait-for-expect";

await waitForExpect(() => {
    expect(wrapper.text()).toContain("Expected text");
});
```

## Policy

- Every new file must ship with corresponding tests
- Aim for >90% statement coverage on new code
- Use `vi.mock` with async factory pattern (shown above) to avoid hoisting issues
- Mock data lives in `src/tests/mockdata.ts`
- Test utilities for EditContent are in `src/components/content/__tests__/EditContent/EditContent.test-utils.ts`
